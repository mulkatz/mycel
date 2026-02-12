#!/bin/bash
# Mycel RAG Cross-Session Test
# Tests whether Session B recalls knowledge from Session A

API="http://localhost:3000"
DOMAIN="community-knowledge"
PERSONA="Community Chronicler"

echo "=== Mycel RAG Cross-Session Test ==="
echo ""

# Step 1: Create Session A
echo "--- Step 1: Create Session A ---"
RESPONSE=$(curl -s -X POST "$API/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"domainSchemaId\": \"$DOMAIN\", \"personaSchemaId\": \"$PERSONA\"}")
SESSION_A=$(echo "$RESPONSE" | jq -r '.sessionId')
GREETING_A=$(echo "$RESPONSE" | jq -r '.greeting')
echo "Session A: $SESSION_A"
echo "Greeting: $GREETING_A"
echo ""

# Step 2: Tell Session A about the church
echo "--- Step 2: Session A – Teach about the church ---"
INPUT_A="Die Dorfkirche wurde 1732 im Barockstil erbaut. Sie hat einen wunderschönen Altar aus Sandstein und eine Orgel aus dem Jahr 1850."
echo "Input: $INPUT_A"
RESPONSE=$(curl -s -X POST "$API/sessions/$SESSION_A/turns" \
  -H "Content-Type: application/json" \
  -d "{\"userInput\": \"$INPUT_A\"}")
RESPONSE_A=$(echo "$RESPONSE" | jq -r '.response')
EXTRACTED_A=$(echo "$RESPONSE" | jq -r '.knowledgeExtracted')
echo "Response: $RESPONSE_A"
echo "Knowledge extracted: $EXTRACTED_A"
echo ""

# Step 3: End Session A
echo "--- Step 3: End Session A ---"
RESPONSE=$(curl -s -X POST "$API/sessions/$SESSION_A/end")
ENTRIES_A=$(echo "$RESPONSE" | jq -r '.knowledgeEntryCount')
echo "Knowledge entries: $ENTRIES_A"
echo ""

# Step 4: Small delay for indexing
echo "--- Step 4: Waiting 3s for indexing ---"
sleep 3
echo ""

# Step 5: Create Session B
echo "--- Step 5: Create Session B ---"
RESPONSE=$(curl -s -X POST "$API/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"domainSchemaId\": \"$DOMAIN\", \"personaSchemaId\": \"$PERSONA\"}")
SESSION_B=$(echo "$RESPONSE" | jq -r '.sessionId')
GREETING_B=$(echo "$RESPONSE" | jq -r '.greeting')
echo "Session B: $SESSION_B"
echo "Greeting: $GREETING_B"
echo ""

# Step 6: Mention the Pfarrhaus (related to church)
echo "--- Step 6: Session B – Mention Pfarrhaus (should recall church) ---"
INPUT_B="Neben der Kirche steht ein altes Pfarrhaus aus dem 19. Jahrhundert."
echo "Input: $INPUT_B"
RESPONSE=$(curl -s -X POST "$API/sessions/$SESSION_B/turns" \
  -H "Content-Type: application/json" \
  -d "{\"userInput\": \"$INPUT_B\"}")
RESPONSE_B=$(echo "$RESPONSE" | jq -r '.response')
EXTRACTED_B=$(echo "$RESPONSE" | jq -r '.knowledgeExtracted')
echo "Response: $RESPONSE_B"
echo "Knowledge extracted: $EXTRACTED_B"
echo ""

# Step 7: End Session B
echo "--- Step 7: End Session B ---"
RESPONSE=$(curl -s -X POST "$API/sessions/$SESSION_B/end")
ENTRIES_B=$(echo "$RESPONSE" | jq -r '.knowledgeEntryCount')
echo "Knowledge entries: $ENTRIES_B"
echo ""

# Summary
echo "========================================="
echo "=== RESULTS ==="
echo "========================================="
echo ""
echo "Session A ($SESSION_A):"
echo "  Input: $INPUT_A"
echo "  Response: $RESPONSE_A"
echo "  Entries: $ENTRIES_A"
echo ""
echo "Session B ($SESSION_B):"
echo "  Input: $INPUT_B"
echo "  Response: $RESPONSE_B"
echo "  Entries: $ENTRIES_B"
echo ""
echo "=== RAG CHECK ==="
echo "Does Session B's response reference the church (1732, Barock, Sandstein, Altar, Orgel)?"
echo ""

# Simple keyword check
KEYWORDS=("1732" "Barock" "Sandstein" "Altar" "Orgel" "Kirche")
FOUND=0
for kw in "${KEYWORDS[@]}"; do
  if echo "$RESPONSE_B" | grep -qi "$kw"; then
    echo "  ✅ Found '$kw' in response"
    FOUND=$((FOUND + 1))
  else
    echo "  ❌ Missing '$kw' in response"
  fi
done

echo ""
if [ $FOUND -gt 0 ]; then
  echo "🟢 RAG WORKING: Session B references knowledge from Session A ($FOUND/${#KEYWORDS[@]} keywords found)"
else
  echo "🔴 RAG NOT WORKING: Session B does not reference Session A knowledge"
fi