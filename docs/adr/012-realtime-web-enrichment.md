# ADR-012: Real-time Web Enrichment

## Status

Accepted

## Date

2026-02-12

## Context

Users contribute knowledge through conversations, but their claims may be inaccurate or incomplete. ADR-010 introduced `DomainBehaviorConfig` with `webSearch` and `knowledgeValidation` dimensions, but enrichment during conversations wasn't implemented. Web search was only used during schema bootstrap (Phase 1).

## Decision

### Async Fire-and-Forget Model

Enrichment runs asynchronously after the main pipeline returns the user's response. The user gets an immediate reply; enrichment happens in the background within the same Cloud Run request lifecycle (300s timeout).

No job queue needed. Errors are logged, never affect user response. This is implemented as a `void promise.catch()` pattern in the session manager.

### Enrichment Pipeline

Three stages, each using `invokeAndValidate` with Zod schemas:

1. **Claim Extraction**: LLM extracts verifiable factual claims from user input (max 5 claims). Opinions and personal experiences are filtered out.

2. **Claim Validation**: For each verifiable claim (up to `maxSearchesPerTurn = 3`):
   - Check search cache (7-day TTL in Firestore)
   - If cache miss, call web search client
   - Cache the result
   - LLM compares claim vs. search results → `verified | contradicted | unverifiable`

3. **Entry Update**: Enrichment metadata (`KnowledgeEnrichment`) is stored on the `KnowledgeEntry` via `knowledgeRepository.update()`.

### Conflict Surfacing

Since enrichment is async, conflicts from the *current* turn can't be surfaced immediately. Instead:

- **Context Dispatcher**: When fetching related entries via vector search, enrichment data is included in context summaries. Contradicted claims get `[DISPUTED: ...]` markers, verified claims get `[VERIFIED]` markers.
- **Persona Agent**: Naturally picks up context annotations and can mention conflicts in its response.
- **Document Generator**: Includes `[verified]` and `[note: web sources suggest X]` markers in generated chapters, with source URLs as footnotes.

### Search Caching

Firestore collection `search-cache` with SHA256 hash of normalized query as document ID. 7-day TTL via Firestore TTL policy on `expiresAt` field. This prevents redundant web searches for common claims across sessions.

### Enrichment Modes

Controlled by domain behavior config:
- `webSearch: 'enrichment'`: Extract and verify claims
- `webSearch: 'full'`: Same as enrichment, plus track discovered attributes for schema evolution proposals (connects to ADR-011)
- Other modes: enrichment skipped

Session routes check `domainSchema.behavior.webSearch` and only pass the enrichment orchestrator to the session manager when the mode is `'enrichment'` or `'full'`.

## Consequences

- User contributions are automatically fact-checked without blocking conversations
- Contradictions surface in subsequent turns and generated documents
- Search caching reduces web search costs for frequently discussed topics
- The async model means a small window where enrichment hasn't completed yet — acceptable tradeoff for responsiveness
- `webSearch: 'full'` mode connects enrichment to schema evolution, enabling discovered attributes to become schema proposals
