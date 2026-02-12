# ADR-011: Schema Evolution via Pattern Detection

## Status

Accepted

## Date

2026-02-12

## Context

As users contribute knowledge through conversations, entries that don't match existing categories accumulate as `_uncategorized`. Over time, patterns emerge — multiple users discussing the same topic (e.g., "local traditions") that the original schema didn't anticipate. Additionally, some schema fields have very low answer rates, indicating they're either poorly worded or irrelevant.

ADR-010 introduced `DomainBehaviorConfig` with a `schemaEvolution` dimension (`fixed | suggest | auto`), but the actual evolution mechanism wasn't implemented.

## Decision

### Pattern Detection via In-Memory Clustering

Analyze uncategorized entries using greedy pairwise cosine similarity clustering:

1. Load all uncategorized entries with embeddings for a domain
2. Compute pairwise cosine similarity
3. Greedy clustering: pick first entry as centroid, find all with similarity > 0.8, form cluster, remove from pool, repeat
4. Filter clusters by minimum size (default: 3)
5. Use LLM to suggest category label/description for each cluster
6. Check for overlap with existing categories (skip if overlap detected)

This approach works well for the expected volume (< 100 uncategorized entries per domain). No external vector clustering service needed.

### Evolution Proposals

Three proposal types:
- **`new_category`**: Discovered from uncategorized entry clusters
- **`new_field`**: Suggested field additions to existing categories
- **`change_priority`**: Demote fields with very low answer rates (< 10%, 10+ asks)

Proposals are stored in a dedicated `evolution-proposals` Firestore collection, separate from bootstrap schema proposals (different data model — incremental vs. whole-schema).

### Auto-Apply Rules (`schemaEvolution: 'auto'`)

- `new_category` with confidence >= 0.7: auto-applied
- `new_field` as optional: auto-applied
- `new_field` as required: requires manual approval
- `change_priority`: auto-applied
- All auto-applied changes logged to `schema-evolution-log` Firestore collection

### Field Stats Tracking

Atomic counters (`timesAsked`, `timesAnswered`) per field per category per domain, stored in Firestore with `FieldValue.increment()`. Stats are:
- Tracked in the session manager after each turn
- Surfaced in gap-reasoning prompts as `[FIELD_STATS]` sections so the LLM naturally deprioritizes low-answer-rate fields
- Used to generate `change_priority` proposals

### Schema Versioning

Evolution creates new schema documents using the existing `saveDomainSchema()` pattern — atomic transaction that deactivates the old version and creates a new one with incremented patch version. No rollback mechanism.

## Consequences

- Uncategorized entries are no longer dead-ends — they drive schema improvement
- Field stats create a feedback loop: low-answer-rate fields get deprioritized, improving conversation quality
- Auto mode enables fully autonomous schema evolution for domains that opt in
- The `schema-evolution-log` provides auditability for automated changes
- Pattern detection is bounded by uncategorized entry count, not total entries, keeping analysis lightweight
