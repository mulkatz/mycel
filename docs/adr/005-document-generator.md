# ADR-005: Document Generator

## Status

Accepted

## Date

2025-02-12

## Context

Knowledge Entries in Firestore are structured JSON — great for machines, unreadable for humans. Users have no way to see what the system has collected without querying the database directly. For a village knowledge domain, the ideal output would read like a local history book: chapters organized by topic, flowing prose, not data dumps.

A readable document also reveals gaps. If a chapter about "History & Heritage" contains a single sentence, it's immediately obvious what's missing — no analytics dashboard required.

This closes the feedback loop that makes the whole system valuable:

```
User contributes knowledge
    → System structures it into Knowledge Entries
        → Document Generator produces a readable book
            → Reader sees what's known AND what's missing
                → Reader contributes more knowledge
```

Without this step, collected knowledge is locked in Firestore and invisible to the people who contributed it.

## Decision

### 1. Standalone Service, Not a Pipeline Agent

The Document Generator runs independently from the per-turn conversation pipeline. It is triggered manually via an API endpoint (`POST /domains/{id}/documents/generate`), not as part of the conversation flow.

Rationale: Generation is expensive (one LLM call per chapter), not needed in real-time, and operates on the full knowledge base across all sessions — fundamentally different from the per-turn agents that process a single user input.

Alternative considered: running generation as a post-turn hook after each conversation. Rejected because regenerating the full document after every turn is wasteful. The trigger model can be extended later (threshold-based, scheduled) without changing the architecture.

### 2. Rule-Based Gap Analyzer Instead of LLM

Gaps are identified by comparing the Domain Schema's `requiredFields` and `optionalFields` against `structuredData` keys in the actual Knowledge Entries. Categories with zero entries are flagged. Fields that no entry has filled are listed.

This is deterministic, fast, and free. The gap hints are appended as italicized blocks at the end of each chapter, making them visible but not intrusive.

Alternative: LLM-based gap analysis that produces richer, more contextual descriptions ("The history chapter would benefit from more information about the founding period"). Deferred — can be layered on top of the rule-based approach later.

### 3. Firestore Storage Instead of Cloud Storage

Generated documents are stored as a single Firestore document at `generated-documents/{domainSchemaId}`, with chapter content in a `chapters` Map field and chapter metadata in a `chapterMeta` Map field.

This keeps everything in one datastore, simplifies reads (no signed URLs, no cross-service auth), and matches the existing repository pattern.

Trade-off: Firestore has a 1MB document size limit. For a domain with ~20 entries producing a few chapters of prose, this is well within limits. If domains grow to hundreds of entries with long chapters, migration to Cloud Storage will be needed.

Alternative: Store each chapter as a separate document in a subcollection, or use Cloud Storage with signed URLs. Both rejected for MVP — the added complexity isn't justified while document sizes are small.

### 4. Sequential LLM Calls Per Chapter

Each chapter is generated with a single Gemini call, and chapters are processed sequentially (not in parallel).

This avoids Vertex AI rate limits, simplifies error handling, and keeps the code straightforward. For an async operation that runs maybe once a day, latency is not critical — a 20-second generation time for 5 chapters is acceptable.

Alternative: Parallel chapter generation with rate limiting or request batching. Rejected — the complexity of managing concurrent LLM calls, retry logic, and partial failures isn't justified for an offline process.

### 5. Text-Mode LLM Client

A new `TextLlmClient` variant returns plain Markdown text instead of parsed JSON. The existing `LlmClient` forces `responseMimeType: 'application/json'` and extracts/validates JSON — wrong for free-form prose.

The text client reuses the same Vertex AI infrastructure (same model, same retry logic, same auth) but sets `responseMimeType: 'text/plain'` and uses a slightly higher temperature (0.4 vs 0.2) for more natural writing.

### 6. Language-Adaptive Output

The generated content matches the language of the Knowledge Entries, detected from the Domain Schema's `ingestion.primaryLanguage` field. The Chapter Writer prompt instructs the LLM to write in the same language as the provided entries.

System code, filenames, API responses, and logs remain in English. Only the generated prose and gap hints adapt to the content language.

This keeps the engine domain-agnostic: the same code works for a German village knowledge base, an English community history, or any other language — no code changes, just a different schema.

### 7. Idempotent Overwrite, No Version History

Each generation replaces the previous document entirely. Running generation twice with the same entries produces the same structure (though LLM prose may vary slightly).

No version history, no diffing, no rollback. This is the simplest possible model and sufficient for MVP where generation is manual and infrequent.

Alternative: Cloud Storage with object versioning for automatic history. Deferred — adds infrastructure complexity for a feature nobody has asked for yet.

## Consequences

### Positive

- Users can finally see what the system knows in readable, human-friendly form
- Gap hints create a natural feedback loop: read what's missing → contribute more
- Domain-agnostic: works for any domain schema and any content language
- Simple architecture: no new infrastructure components, just Firestore + LLM calls
- API-first: documents accessible via GET endpoints, ready for a future frontend
- Modular design: entry-collector, chapter-planner, chapter-writer, gap-analyzer, and index-generator are independent, testable units

### Negative

- Multiple LLM calls per generation = cost per trigger (one call per non-empty chapter)
- No incremental updates — full regeneration even if only one entry changed
- 1MB Firestore document limit will eventually require migration to Cloud Storage
- No version history means previous generations are lost on regeneration
- LLM prose is non-deterministic — same entries may produce slightly different wording

### Implementation Impact

- New service in `packages/core/src/services/document-generator/` (6 sub-modules + orchestrator)
- New `TextLlmClient` in `packages/core/src/llm/text-llm-client.ts`
- One new method on `KnowledgeRepository` interface: `getByDomain(domainSchemaId)`
- New API routes under `/domains/:id/documents/*` (generate, latest, meta, chapter)
- New Firestore collection: `generated-documents`
- No changes to the conversation pipeline, existing agents, or Knowledge Entry structure
