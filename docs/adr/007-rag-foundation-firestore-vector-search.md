# ADR-007: RAG Foundation — Firestore Vector Search

## Status

Accepted

## Date

2026-02-12

## Context

Mycel collects knowledge across multiple conversation sessions. Without cross-session memory, the system asks redundant questions and misses opportunities to connect related knowledge. For example, if a user shares information about the village church in session 1, the system should recall this in session 2 when the user mentions the town square.

RAG (Retrieval-Augmented Generation) gives the system this memory: embed each knowledge entry as a vector, then retrieve similar entries when processing new input. This context feeds into the agent pipeline, enabling smarter follow-ups and avoiding redundant questions.

The key decisions are: where to store and search vectors, which embedding model to use, when to generate embeddings, and where in the pipeline to integrate retrieval.

## Decision

### Firestore Vector Search over Vertex AI Vector Search

Use Firestore's native `findNearest()` for vector similarity search, not the dedicated Vertex AI Vector Search service. This diverges from ADR-002, which originally planned for Vertex AI Vector Search — that decision was revisited once the actual cost and complexity became clear.

Alternatives considered:
- **Vertex AI Vector Search**: Purpose-built for high-performance vector search with ANN (Approximate Nearest Neighbor). However, it requires a dedicated index endpoint (~$200/month minimum), separate infrastructure to manage, and a more complex deployment pipeline. Overkill for our current scale (hundreds to low thousands of entries).
- **pgvector (Cloud SQL)**: Would require introducing PostgreSQL alongside Firestore, adding operational complexity for a single feature.
- **Pinecone / Weaviate**: Third-party vector databases with excellent developer experience, but add a non-GCP dependency, data residency concerns, and another service to manage.

Firestore Vector Search was chosen because:
- Zero additional infrastructure — vectors live alongside the documents they belong to
- No extra cost beyond normal Firestore pricing
- `findNearest()` supports cosine distance, which is sufficient for our similarity needs
- If we outgrow it, migration to Vertex AI Vector Search is straightforward (same embeddings, same GCP project)
- Keeps the architecture simple — one database for everything

### Embedding Model: text-multilingual-embedding-002

Use Vertex AI's `text-multilingual-embedding-002` model (768 dimensions).

This model was chosen because:
- Multilingual support — Mycel's primary use case involves German content, and this model is specifically optimized for non-English languages
- 768 dimensions — a good balance between embedding quality and storage/compute cost
- Vertex AI native — same auth, same project, no additional API keys

### Synchronous Embedding Generation

Embeddings are generated synchronously when a Knowledge Entry is persisted, adding ~500ms overhead per entry. The embedding is stored directly on the Knowledge Entry document in Firestore.

Alternatives considered:
- **Async queue (Cloud Tasks / Pub/Sub)**: Decouples embedding generation from the conversation flow. Rejected because it adds infrastructure complexity, and the ~500ms overhead is acceptable within a conversation turn that already involves multiple LLM calls (~2-5 seconds total).
- **Batch processing**: Generate embeddings periodically for entries that lack them. Rejected because cross-session recall should be available immediately — if a user starts a new session, entries from the previous session should already be searchable.

Graceful degradation: if embedding generation fails, the entry is persisted without an embedding and a warning is logged. The conversation is never broken by an embedding failure.

### Context Dispatcher as RAG Integration Point

The Context Dispatcher agent (step 2 in the pipeline, after Classifier) performs the vector search. It generates an embedding for the current user input, queries similar entries, and produces a `contextSummary` string that downstream agents (Gap Reasoning, Persona) use to avoid redundant questions and build on prior knowledge.

This is the natural integration point because the Context Dispatcher already exists in the pipeline with this responsibility (ADR-003), and retrieval should happen before gap analysis and response generation.

### Cross-Session Recall

New sessions can access knowledge from all previous sessions for the same domain. The `searchSimilar` query filters by `domainSchemaId` and optionally excludes entries from the current session (to avoid matching the entry being built in the current conversation).

## Consequences

### Positive

- Cross-session memory makes conversations smarter — no redundant questions, builds on prior knowledge
- Zero additional infrastructure — vectors stored alongside their documents in Firestore
- Immediate availability — entries are searchable as soon as they're created
- Graceful degradation — embedding failures never break conversations
- Migration path — same embeddings work with Vertex AI Vector Search if scale demands it

### Negative

- ~500ms latency overhead per turn for embedding generation
- Firestore's `findNearest()` uses brute-force search (not ANN) — will slow down at tens of thousands of entries
- Firestore emulator may not support `findNearest()`, requiring fallback to empty results in local testing
- 768-dimensional vectors increase Firestore document size and storage costs
- Embedding quality depends on the model — multilingual embeddings may have lower precision than English-only models for English content
