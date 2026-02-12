# ADR-010: Dynamic Schema Bootstrap via Web Search

## Status

Accepted

## Date

2026-02-12

## Context

Mycel's Domain Schemas are currently static JSON files seeded into Firestore via `scripts/seed-schemas.ts`. Onboarding a new domain requires manually designing categories, fields, and ingestion config upfront — a significant barrier for non-technical users.

Two gaps need addressing:

1. **No behavioral configuration**: All domains behave identically. There's no way to control whether a domain uses web search, how aggressively the system asks follow-up questions, or when documents get generated.

2. **No automated schema creation**: A user who wants to build a knowledge base about "beekeeping in Brandenburg" must manually author a JSON schema with appropriate categories and fields before they can start a conversation.

## Decision

### DomainBehaviorConfig

Introduce a `DomainBehaviorConfig` type that controls how each domain operates across all Mycel features. This is an extension to `PersistedDomainSchema`, not a separate Firestore collection.

The name `DomainBehaviorConfig` avoids collision with the existing `DomainConfig` type (used in ~20 files), which defines schema structure (categories, fields, ingestion).

Six behavioral dimensions, each an enum:
- `schemaCreation`: manual | web_research | hybrid
- `schemaEvolution`: fixed | suggest | auto
- `webSearch`: disabled | bootstrap_only | enrichment | full
- `knowledgeValidation`: trust_user | flag_conflicts | verify
- `proactiveQuestioning`: passive | gentle | active
- `documentGeneration`: disabled | manual | on_session_end | threshold

Three presets (`manual`, `balanced`, `full_auto`) provide sensible defaults.

### Schema Bootstrap via Web Search

Use the `@google/genai` SDK with Gemini's built-in Google Search grounding to research a domain topic and propose a structured schema. This uses the free grounding capability built into the Gemini API — not a paid search API.

The flow:
1. User provides a plain-text domain description (e.g., "A village website for Naugarten, Brandenburg")
2. LLM analyzes the description to produce domain metadata and search queries
3. Web search gathers information about the domain topic
4. LLM synthesizes a complete `DomainConfig` from the research
5. Result is stored as a `SchemaProposal` with status `pending`
6. User reviews and approves/rejects/modifies before it becomes active

Proposals are never auto-activated. This is a deliberate design choice: schema creation is a high-impact decision that should always have human review.

### Hybrid Mode

Users can provide a partial schema (some categories already defined) and let the system fill in gaps via web research. The partial schema's categories are preserved and passed to the synthesis LLM with instructions to keep them and add research-based additions.

## Consequences

### Positive
- New domains can be bootstrapped in minutes instead of hours
- Behavioral config enables per-domain customization without code changes
- Proposal/review workflow ensures human oversight
- `@google/genai` SDK is lightweight and uses free built-in grounding

### Negative
- New Firestore collection (`schema-proposals`) adds operational complexity
- Web search results vary by region and time — proposals are not deterministic
- `@google/genai` is a new dependency alongside existing `@langchain/google-vertexai`

### Risks
- Google Search grounding quality varies by topic obscurity
- Phase 2/3 hooks (schema evolution, enrichment mode) are deferred

## Alternatives Considered

1. **Paid Google Search API**: More control over search parameters, but costly and requires separate API key management. Gemini's built-in grounding is free and sufficient for bootstrap use.

2. **Separate DomainBehaviorConfig collection**: Would require joins on every domain lookup. Embedding in `PersistedDomainSchema` keeps reads simple and atomic.

3. **Auto-activate generated schemas**: Rejected — schema quality directly impacts conversation quality. Human review is non-negotiable for Phase 1.
