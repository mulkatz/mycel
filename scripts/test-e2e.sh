#!/bin/bash
# =============================================================================
# Mycel — End-to-End Integration Test Script
# =============================================================================
#
# Tests all features against the live Cloud Run API.
# Run after deploying to verify everything works with real Gemini.
#
# Prerequisites:
#   - Cloud Run service is deployed and accessible
#   - Set SERVICE_URL below (or pass as first argument)
#
# Usage:
#   ./scripts/test-e2e.sh
#   ./scripts/test-e2e.sh https://mycel-api-xxxxx-ey.a.run.app
#
# =============================================================================

set -euo pipefail

# Load .env if present (provides MYCEL_GCP_API_KEY, etc.)
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
  # E2E runs against live Firestore, not the emulator
  unset FIRESTORE_EMULATOR_HOST
fi

GCP_PROJECT="${MYCEL_GCP_PROJECT_ID:-}"
GCP_REGION="${MYCEL_GCP_REGION:-europe-west3}"
SERVICE_URL="${1:-$(gcloud run services describe mycel-api --region="$GCP_REGION" --project="$GCP_PROJECT" --format='value(status.url)' 2>/dev/null || echo "")}"

if [ -z "$SERVICE_URL" ]; then
  echo "❌ No SERVICE_URL. Pass as argument or ensure gcloud is configured."
  exit 1
fi

# The persona schema name seeded in Firestore
PERSONA_NAME="Community Chronicler"

# --- Obtain anonymous auth token via Identity Platform ---
GCP_API_KEY="${MYCEL_GCP_API_KEY:-}"
if [ -z "$GCP_API_KEY" ]; then
  echo "❌ MYCEL_GCP_API_KEY is required. Set it to your GCP API key for Identity Platform."
  echo "   You can find it in the GCP Console → APIs & Services → Credentials."
  exit 1
fi

echo "🔑 Obtaining anonymous auth token..."
TOKEN_RESPONSE=$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${GCP_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"returnSecureToken":true}')
ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.idToken // empty')

if [ -z "$ID_TOKEN" ]; then
  echo "❌ Failed to obtain auth token."
  echo "   Response: $TOKEN_RESPONSE"
  exit 1
fi

ANON_UID=$(echo "$TOKEN_RESPONSE" | jq -r '.localId // empty')
AUTH_HEADER="Authorization: Bearer ${ID_TOKEN}"
echo "   Token obtained (anonymous user: ${ANON_UID})"

# Seed persona schema for this tenant
echo "🌱 Seeding persona schema for tenant ${ANON_UID}..."
npx tsx scripts/seed-schemas.ts --tenant-id="${ANON_UID}" 2>&1 | sed 's/^/   /'

echo "🍄 Mycel E2E Test Suite"
echo "   Target: $SERVICE_URL"
echo "   Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASSED=$((PASSED + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILED=$((FAILED + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }
section() { echo ""; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; echo "📋 $1"; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }

# Helper: make a request and capture response + status code
request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    curl -s -w "\n%{http_code}" -X "$method" "$SERVICE_URL$path" \
      -H "Content-Type: application/json" \
      -H "$AUTH_HEADER" \
      -d "$data" 2>/dev/null
  else
    curl -s -w "\n%{http_code}" -X "$method" "$SERVICE_URL$path" \
      -H "$AUTH_HEADER" 2>/dev/null
  fi
}

# Helper: extract HTTP status from response
get_status() { echo "$1" | tail -1; }
# Helper: extract body from response
get_body() { echo "$1" | sed '$d'; }

# =============================================================================
section "1. Health Check"
# =============================================================================

RESPONSE=$(request GET /health)
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ]; then
  pass "Health endpoint returns 200"
else
  fail "Health endpoint returned $STATUS"
  echo "  Response: $BODY"
  echo ""
  echo "❌ Service is not healthy. Aborting."
  exit 1
fi

# =============================================================================
section "1b. API Documentation"
# =============================================================================

# OpenAPI spec — no auth required
RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/openapi.json" 2>/dev/null)
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ]; then
  pass "OpenAPI spec returns 200"

  # Validate it's valid JSON with expected fields
  TITLE=$(echo "$BODY" | jq -r '.info.title // empty' 2>/dev/null || echo "")
  if [ "$TITLE" = "Mycel API" ]; then
    pass "OpenAPI spec has correct title"
  else
    fail "OpenAPI spec missing or wrong title: $TITLE"
  fi

  OPENAPI_VER=$(echo "$BODY" | jq -r '.openapi // empty' 2>/dev/null || echo "")
  if [ "$OPENAPI_VER" = "3.1.0" ]; then
    pass "OpenAPI version is 3.1.0"
  else
    fail "Unexpected OpenAPI version: $OPENAPI_VER"
  fi
else
  fail "OpenAPI spec returned $STATUS"
fi

# Scalar docs — no auth required
RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVICE_URL/docs" 2>/dev/null)
STATUS=$(get_status "$RESPONSE")

if [ "$STATUS" = "200" ]; then
  pass "Scalar API docs returns 200"
else
  fail "Scalar API docs returned $STATUS"
fi

# =============================================================================
section "2. Schema Bootstrap via Web Search"
# =============================================================================

echo ""
info "Generating schema from description..."

RESPONSE=$(request POST /domains/generate '{
  "description": "A village website for Naugarten, a small village in the Uckermark region of Brandenburg, Germany. We want to collect knowledge about the village history, buildings, nature, local associations, and village life.",
  "language": "de",
  "config": "balanced"
}')
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
  pass "Schema generation endpoint returned $STATUS"
else
  fail "Schema generation returned $STATUS"
  echo "  Response: $BODY"
fi

# Extract proposal ID
PROPOSAL_ID=$(echo "$BODY" | jq -r '.proposalId // empty' 2>/dev/null || echo "")

if [ -n "$PROPOSAL_ID" ]; then
  pass "Got proposal ID: $PROPOSAL_ID"
else
  fail "No proposalId in response"
  echo "  Response: $BODY"
fi

# Extract domain name (used by all subsequent endpoints that do name-based lookup)
DOMAIN_NAME=$(echo "$BODY" | jq -r '.domain.name // empty' 2>/dev/null || echo "")
if [ -n "$DOMAIN_NAME" ]; then
  pass "Domain name: $DOMAIN_NAME"
else
  warn "No domain name in response"
fi

# Check that categories were generated
CATEGORY_COUNT=$(echo "$BODY" | jq '.domain.categories | length' 2>/dev/null || echo "0")

if [ "$CATEGORY_COUNT" -gt 0 ]; then
  pass "Schema has $CATEGORY_COUNT categories"
  info "Categories: $(echo "$BODY" | jq -r '.domain.categories[].id' 2>/dev/null | tr '\n' ', ')"
else
  fail "No categories generated"
fi

# Check for sources
SOURCE_COUNT=$(echo "$BODY" | jq '.sources | length' 2>/dev/null || echo "0")

if [ "$SOURCE_COUNT" -gt 0 ]; then
  pass "Schema includes $SOURCE_COUNT web sources"
else
  warn "No web sources in response (Gemini grounding may not have returned URLs)"
fi

# Approve the proposal
DOMAIN_SCHEMA_ID=""
if [ -n "$PROPOSAL_ID" ]; then
  echo ""
  info "Approving schema proposal..."

  RESPONSE=$(request POST "/domains/proposals/$PROPOSAL_ID/review" '{
    "decision": "approve"
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Schema proposal approved"
    DOMAIN_SCHEMA_ID=$(echo "$BODY" | jq -r '.domainSchemaId // empty' 2>/dev/null || echo "")
    if [ -n "$DOMAIN_SCHEMA_ID" ]; then
      pass "Domain schema created: $DOMAIN_SCHEMA_ID"
    else
      fail "No domainSchemaId in approval response"
      echo "  Response: $BODY"
    fi
  else
    fail "Schema approval returned $STATUS"
    echo "  Response: $BODY"
  fi
fi

# Use the domain NAME for all subsequent API calls (endpoints look up by name)
# Fall back to the Firestore doc ID, then a hardcoded name
DOMAIN_ID="${DOMAIN_NAME:-${DOMAIN_SCHEMA_ID:-village-knowledge}}"
info "Using domain identifier for subsequent calls: $DOMAIN_ID"

# =============================================================================
section "3. Conversation Flow — Basic"
# =============================================================================

echo ""
info "Creating session with domain: $DOMAIN_ID, persona: $PERSONA_NAME"

RESPONSE=$(request POST /sessions "{
  \"domainSchemaId\": \"$DOMAIN_ID\",
  \"personaSchemaId\": \"$PERSONA_NAME\"
}")
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
  pass "Session created"
else
  fail "Session creation returned $STATUS"
  echo "  Response: $BODY"
fi

SESSION_ID=$(echo "$BODY" | jq -r '.sessionId // .id // empty' 2>/dev/null || echo "")

if [ -n "$SESSION_ID" ]; then
  pass "Session ID: $SESSION_ID"
else
  fail "No session ID in response"
  echo "  Response: $BODY"
fi

# Check for proactive greeting
GREETING=$(echo "$BODY" | jq -r '.greeting // .message // .response // empty' 2>/dev/null || echo "")

if [ -n "$GREETING" ]; then
  pass "Proactive greeting received"
  info "Greeting: ${GREETING:0:100}..."
else
  warn "No greeting in session creation response"
fi

# --- Turn 1: Actual content ---
if [ -n "$SESSION_ID" ]; then
  echo ""
  info "Turn 1: Sending factual content..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID/turns" '{
    "userInput": "The old village church in Naugarten was built in 1732 in baroque style. It sits on a small hill at the edge of the village."
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Turn 1 accepted"

    # Check for persona response
    PERSONA_RESPONSE=$(echo "$BODY" | jq -r '.response // .personaResponse // empty' 2>/dev/null || echo "")
    if [ -n "$PERSONA_RESPONSE" ]; then
      pass "Persona response received"
      info "Response: ${PERSONA_RESPONSE:0:120}..."
    else
      warn "No persona response in turn output"
    fi

    # Check for knowledge entry
    ENTRY_ID=$(echo "$BODY" | jq -r '.knowledgeEntryId // .entryId // empty' 2>/dev/null || echo "")
    if [ -n "$ENTRY_ID" ]; then
      pass "Knowledge entry created: $ENTRY_ID"
      FIRST_ENTRY_ID="$ENTRY_ID"
    else
      warn "No knowledge entry ID in response (may be nested differently)"
    fi
  else
    fail "Turn 1 returned $STATUS"
    echo "  Response: $BODY"
  fi

  # --- Turn 2: Greeting (should NOT create knowledge entry) ---
  echo ""
  info "Turn 2: Sending greeting (should not create entry)..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID/turns" '{
    "userInput": "hi"
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Greeting turn accepted"

    ENTRY_ID=$(echo "$BODY" | jq -r '.knowledgeEntryId // .entryId // empty' 2>/dev/null || echo "")
    if [ -z "$ENTRY_ID" ] || [ "$ENTRY_ID" = "null" ]; then
      pass "No knowledge entry created for greeting"
    else
      fail "Knowledge entry created for greeting (should not happen): $ENTRY_ID"
    fi
  else
    fail "Greeting turn returned $STATUS"
  fi

  # --- Turn 3: Topic change ---
  echo ""
  info "Turn 3: Topic change (church → lake)..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID/turns" '{
    "userInput": "There is a beautiful lake near the village. In summer the locals go swimming there."
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Topic change turn accepted"

    PERSONA_RESPONSE=$(echo "$BODY" | jq -r '.response // .personaResponse // empty' 2>/dev/null || echo "")
    # Check that the response is about the lake, not the church
    if echo "$PERSONA_RESPONSE" | grep -iq -E "lake|see|swim|baden|wasser|water"; then
      pass "Response is about the lake (topic change detected)"
    elif [ -n "$PERSONA_RESPONSE" ]; then
      warn "Response may not be about the lake: ${PERSONA_RESPONSE:0:100}..."
    fi
  else
    fail "Topic change turn returned $STATUS"
  fi

  # --- Turn 4: "I don't know" ---
  echo ""
  info "Turn 4: Testing 'I don't know' handling..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID/turns" '{
    "userInput": "I don'\''t know, no idea"
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "'I don't know' turn accepted"

    PERSONA_RESPONSE=$(echo "$BODY" | jq -r '.response // .personaResponse // empty' 2>/dev/null || echo "")
    if [ -n "$PERSONA_RESPONSE" ]; then
      pass "System responded gracefully"
      info "Response: ${PERSONA_RESPONSE:0:120}..."
    fi
  else
    fail "'I don't know' turn returned $STATUS"
  fi

  # --- Turn 5: "Ask me something" ---
  echo ""
  info "Turn 5: Testing proactive question trigger..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID/turns" '{
    "userInput": "Ask me something about the village"
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Proactive question trigger accepted"

    PERSONA_RESPONSE=$(echo "$BODY" | jq -r '.response // .personaResponse // empty' 2>/dev/null || echo "")
    if [ -n "$PERSONA_RESPONSE" ]; then
      pass "System generated proactive question"
      info "Question: ${PERSONA_RESPONSE:0:120}..."
    fi
  else
    fail "Proactive question trigger returned $STATUS"
  fi

  # --- Turn 6-8: More content for document generation and evolution testing ---
  echo ""
  info "Turns 6-8: Adding more content for later tests..."

  for INPUT in \
    "The volunteer fire brigade was founded in 1952. They have about 20 active members and organize the annual village festival." \
    "There is an old oak tree near the lake that is said to be over 300 years old. The locals call it the Dorfeiche." \
    "My grandmother used to make the best Pflaumenkuchen every autumn. The whole village would come together for the harvest festival."
  do
    RESPONSE=$(request POST "/sessions/$SESSION_ID/turns" "{\"userInput\": \"$INPUT\"}")
    STATUS=$(get_status "$RESPONSE")
    if [ "$STATUS" = "200" ]; then
      pass "Content turn accepted"
    else
      fail "Content turn returned $STATUS"
    fi
    sleep 2  # Give the LLM some breathing room
  done

  # --- End session ---
  echo ""
  info "Ending session..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID/end")
  STATUS=$(get_status "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Session ended successfully"
  else
    warn "Session end returned $STATUS (may not be implemented as endpoint)"
  fi
fi

# =============================================================================
section "4. Schema Evolution"
# =============================================================================

echo ""
info "Adding uncategorized content to trigger evolution..."

# Create a new session for uncategorized content
RESPONSE=$(request POST /sessions "{
  \"domainSchemaId\": \"$DOMAIN_ID\",
  \"personaSchemaId\": \"$PERSONA_NAME\"
}")
SESSION_ID_2=$(echo "$(get_body "$RESPONSE")" | jq -r '.sessionId // .id // empty' 2>/dev/null || echo "")

if [ -n "$SESSION_ID_2" ]; then
  # Add entries that don't fit existing categories (recipes / culinary)
  for INPUT in \
    "Every Christmas, the women in the village make Stollengebäck together. It is an old recipe passed down for generations." \
    "In autumn we make Holundersirup from the elderberry bushes near the lake. You have to pick them before the first frost." \
    "The village pub used to serve Kartoffelsuppe every Friday. It was the best in the whole Uckermark."
  do
    RESPONSE=$(request POST "/sessions/$SESSION_ID_2/turns" "{\"userInput\": \"$INPUT\"}")
    STATUS=$(get_status "$RESPONSE")
    if [ "$STATUS" = "200" ]; then
      pass "Uncategorized content turn accepted"
    else
      fail "Uncategorized content turn returned $STATUS"
    fi
    sleep 2
  done

  # End session
  request POST "/sessions/$SESSION_ID_2/end" > /dev/null 2>&1

  # Trigger evolution analysis
  echo ""
  info "Triggering schema evolution analysis..."
  sleep 3  # Wait for entries to be fully persisted

  RESPONSE=$(request POST "/domains/$DOMAIN_ID/evolution/analyze")
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
    pass "Evolution analysis completed"

    PROPOSAL_COUNT=$(echo "$BODY" | jq '.proposals | length' 2>/dev/null || echo "0")
    if [ "$PROPOSAL_COUNT" -gt 0 ]; then
      pass "Evolution generated $PROPOSAL_COUNT proposal(s)"
      info "Proposals: $(echo "$BODY" | jq -r '.proposals[].type' 2>/dev/null | tr '\n' ', ')"
    else
      warn "No evolution proposals generated (may need more entries for clustering)"
    fi
  else
    fail "Evolution analysis returned $STATUS"
    echo "  Response: $BODY"
  fi

  # Check field stats
  echo ""
  info "Checking field statistics..."

  RESPONSE=$(request GET "/domains/$DOMAIN_ID/evolution/stats")
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Field stats endpoint responds"
    STAT_COUNT=$(echo "$BODY" | jq '.stats | length' 2>/dev/null || echo "0")
    info "Tracking stats for $STAT_COUNT fields"
  else
    warn "Field stats returned $STATUS"
  fi
else
  fail "Could not create second session for evolution testing"
fi

# =============================================================================
section "5. Web Enrichment"
# =============================================================================

echo ""
info "Creating session with enrichment enabled..."

# Note: With 'balanced' preset, webSearch = 'bootstrap_only' so enrichment won't run.
# This test verifies the session flow works; enrichment requires webSearch = 'enrichment' or 'full'.

RESPONSE=$(request POST /sessions "{
  \"domainSchemaId\": \"$DOMAIN_ID\",
  \"personaSchemaId\": \"$PERSONA_NAME\"
}")
SESSION_ID_3=$(echo "$(get_body "$RESPONSE")" | jq -r '.sessionId // .id // empty' 2>/dev/null || echo "")

if [ -n "$SESSION_ID_3" ]; then
  info "Sending verifiable claim..."

  RESPONSE=$(request POST "/sessions/$SESSION_ID_3/turns" '{
    "userInput": "The Uckermark region has about 120,000 inhabitants and is one of the least densely populated areas in Germany."
  }')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Verifiable claim turn accepted"

    # Get the entry ID from the turn response
    ENRICH_ENTRY_ID=$(echo "$BODY" | jq -r '.knowledgeEntryId // .entryId // empty' 2>/dev/null || echo "")

    # Enrichment is async — wait a bit and check
    info "Waiting 10s for async enrichment..."
    sleep 10

    # Check enrichment status on the entry (not session)
    if [ -n "$ENRICH_ENTRY_ID" ] && [ "$ENRICH_ENTRY_ID" != "null" ]; then
      RESPONSE=$(request GET "/entries/$ENRICH_ENTRY_ID/enrichment")
      STATUS=$(get_status "$RESPONSE")
      BODY=$(get_body "$RESPONSE")

      if [ "$STATUS" = "200" ]; then
        pass "Enrichment data retrieved for entry $ENRICH_ENTRY_ID"

        VALIDATION_STATUS=$(echo "$BODY" | jq -r '.validationStatus // empty' 2>/dev/null || echo "")
        if [ -n "$VALIDATION_STATUS" ]; then
          pass "Validation status: $VALIDATION_STATUS"
        fi

        CLAIM_COUNT=$(echo "$BODY" | jq '.validatedClaims | length' 2>/dev/null || echo "0")
        if [ "$CLAIM_COUNT" -gt 0 ]; then
          pass "Found $CLAIM_COUNT validated claim(s)"
          info "Claims: $(echo "$BODY" | jq -r '.validatedClaims[].status' 2>/dev/null | tr '\n' ', ')"
        else
          warn "No validated claims yet (enrichment may still be processing or disabled for this domain)"
        fi
      elif [ "$STATUS" = "404" ]; then
        warn "No enrichment data yet (may be disabled for this domain's config or still processing)"
      else
        warn "Enrichment endpoint returned $STATUS"
      fi
    else
      warn "No entry ID from turn response — cannot check enrichment"
    fi
  else
    fail "Verifiable claim turn returned $STATUS"
  fi

  request POST "/sessions/$SESSION_ID_3/end" > /dev/null 2>&1
else
  fail "Could not create session for enrichment testing"
fi

# =============================================================================
section "6. Document Generator"
# =============================================================================

echo ""
info "Generating documentation for domain: $DOMAIN_ID"

RESPONSE=$(request POST "/domains/$DOMAIN_ID/documents/generate")
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")
GEN_BODY="$BODY"  # Save for chapter filename extraction

if [ "$STATUS" = "200" ]; then
  pass "Document generation completed"

  CHAPTER_COUNT=$(echo "$BODY" | jq '.chapters | length' 2>/dev/null || echo "0")
  if [ "$CHAPTER_COUNT" -gt 0 ]; then
    pass "Generated $CHAPTER_COUNT chapters"
    info "Chapters: $(echo "$BODY" | jq -r '.chapters[].title' 2>/dev/null | tr '\n' ', ')"
  else
    warn "No chapters in response"
  fi

  TOTAL_ENTRIES=$(echo "$BODY" | jq '.meta.totalEntries' 2>/dev/null || echo "0")
  info "Total entries processed: $TOTAL_ENTRIES"

  GAPS=$(echo "$BODY" | jq '.meta.gapsIdentified' 2>/dev/null || echo "0")
  info "Gaps identified: $GAPS"
else
  fail "Document generation returned $STATUS"
  echo "  Response: $BODY"
fi

# Fetch the generated index
echo ""
info "Fetching generated index..."

RESPONSE=$(request GET "/domains/$DOMAIN_ID/documents/latest")
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ]; then
  pass "Index document retrieved"
  info "Index preview: ${BODY:0:200}..."
else
  warn "Index retrieval returned $STATUS"
fi

# Fetch first chapter
echo ""
info "Fetching first chapter..."

FIRST_CHAPTER=$(echo "$GEN_BODY" | jq -r '.chapters[0].filename // empty' 2>/dev/null || echo "")
if [ -z "$FIRST_CHAPTER" ]; then
  FIRST_CHAPTER="01-buildings.md"
fi

RESPONSE=$(request GET "/domains/$DOMAIN_ID/documents/latest/$FIRST_CHAPTER")
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ]; then
  pass "Chapter document retrieved"
  info "Chapter preview: ${BODY:0:200}..."
else
  warn "Chapter retrieval returned $STATUS (filename may differ: tried $FIRST_CHAPTER)"
fi

# Fetch meta
echo ""
info "Fetching document metadata..."

RESPONSE=$(request GET "/domains/$DOMAIN_ID/documents/latest/meta")
STATUS=$(get_status "$RESPONSE")
BODY=$(get_body "$RESPONSE")

if [ "$STATUS" = "200" ]; then
  pass "Document metadata retrieved"
  info "Generated at: $(echo "$BODY" | jq -r '.generatedAt' 2>/dev/null)"
  info "Content language: $(echo "$BODY" | jq -r '.contentLanguage' 2>/dev/null)"
else
  warn "Document metadata returned $STATUS"
fi

# =============================================================================
section "7. Session Status Check"
# =============================================================================

if [ -n "${SESSION_ID:-}" ]; then
  RESPONSE=$(request GET "/sessions/$SESSION_ID")
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    pass "Session details retrieved"
    info "Status: $(echo "$BODY" | jq -r '.status // .state // "unknown"' 2>/dev/null)"
    info "Turn count: $(echo "$BODY" | jq -r '.turnCount // .turns // "unknown"' 2>/dev/null)"
  else
    warn "Session details returned $STATUS"
  fi
fi

# =============================================================================
section "Summary"
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${RED}Failed:${NC}   $FAILED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}❌ $FAILED test(s) failed. Review output above.${NC}"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo -e "${YELLOW}⚠  All tests passed but $WARNINGS warning(s). Review above.${NC}"
  exit 0
else
  echo -e "${GREEN}🍄 All tests passed! Mycel is healthy.${NC}"
  exit 0
fi
