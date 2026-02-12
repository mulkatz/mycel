# RAG Foundation – Implementation Plan

## Overview

Give Mycel cross-session memory via embedding-based retrieval. When a user shares knowledge, the Context Dispatcher retrieves related entries from previous sessions, enabling smarter follow-ups and avoiding redundant questions.

**Key decisions (from spec):**
- Vertex AI `text-multilingual-embedding-002` for embeddings (768 dimensions, German-optimized)
- Firestore native `findNearest()` instead of Vertex AI Vector Search (no extra infra)
- Synchronous embedding generation (in `persistKnowledgeEntry`, ~500ms overhead)

## Step-by-Step Implementation

### Step 1: EmbeddingClient Interface + Mock

**New file:** `packages/core/src/embedding/embedding-client.ts`

```typescript
export interface EmbeddingClient {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSION = 768;
```

**New file:** `packages/core/src/embedding/mock-embedding-client.ts`

Returns deterministic fixed-dimension vectors for testing. Uses a simple hash of the input text to produce a reproducible 768-dimensional vector so that similar inputs produce somewhat similar vectors (not truly semantic, but deterministic and testable).

**New file:** `packages/core/src/embedding/vertex-embedding-client.ts`

Calls `text-multilingual-embedding-002` via `@google-cloud/aiplatform` SDK:
- Uses `PredictionServiceClient` to call the embedding model
- Model name configurable via `MYCEL_EMBEDDING_MODEL` env var (default: `text-multilingual-embedding-002`)
- Project ID + location from existing env vars (`MYCEL_GCP_PROJECT_ID`, `VERTEX_AI_LOCATION`)
- Handles errors gracefully — wraps in typed `LlmError`

**New dependency:** `@google-cloud/aiplatform` added to `packages/core/package.json`.

**New file:** `packages/core/src/embedding/embedding-text-builder.ts`

`buildEmbeddingText(entry)` — concatenates category, title, content, and key structured data fields into a single searchable string. Adapts to whatever fields are present.

**Tests:** `embedding-client.test.ts` (mock returns correct dimensions), `embedding-text-builder.test.ts` (verifies text composition).

### Step 2: KnowledgeEntry Embedding Fields

**Modify:** `packages/shared/src/types/knowledge.types.ts`

Add to `KnowledgeEntry`:
```typescript
readonly embedding?: readonly number[];
readonly embeddingModel?: string;
readonly embeddingGeneratedAt?: Date;
```

Optional fields — existing entries without embeddings remain valid.

**Modify:** `packages/core/src/repositories/knowledge.repository.ts`

Add to `CreateKnowledgeEntryInput`:
```typescript
readonly embedding?: readonly number[];
readonly embeddingModel?: string;
```

Add new method to `KnowledgeRepository`:
```typescript
searchSimilar(params: {
  domainSchemaId: string;
  embedding: readonly number[];
  limit?: number;
  excludeSessionId?: string;
}): Promise<readonly KnowledgeSearchResult[]>;
```

No `minScore` param at the Firestore level — post-filter in application code since `findNearest` doesn't support distance thresholds as query constraints.

### Step 3: In-Memory Repository — searchSimilar

**Modify:** `packages/core/src/repositories/in-memory-knowledge.repository.ts`

Implement `searchSimilar` with a simple cosine similarity calculation:
- Filter by matching `domainSchemaId` (we'll need to store this — see note below)
- Exclude entries from `excludeSessionId`
- Only consider entries that have an embedding
- Sort by cosine similarity descending, return top `limit` (default 5)
- Post-filter by minimum score threshold (0.7)

**Note on domainSchemaId:** Currently `KnowledgeEntry` does not store the domain schema ID. The `CreateKnowledgeEntryInput` also doesn't have it. We need to decide: store the domain config name on the entry, or filter by some proxy (like sessionId → session → domainConfigName). Since Firestore `findNearest` needs a `where` clause on `domainSchemaId`, the cleanest approach is to add `domainSchemaId` to `CreateKnowledgeEntryInput` and store it on the document.

**Add to `KnowledgeEntry`:**
```typescript
readonly domainSchemaId?: string;
```

**Add to `CreateKnowledgeEntryInput`:**
```typescript
readonly domainSchemaId: string;
```

**Modify `persistKnowledgeEntry`** in `session-manager.ts` to pass `domainConfig.name` as `domainSchemaId`.

### Step 4: Firestore Repository — searchSimilar + Embedding Storage

**Modify:** `packages/core/src/infrastructure/firestore-knowledge.repository.ts`

Add embedding fields to `KnowledgeEntryDocument`:
```typescript
embedding?: number[];           // stored as FieldValue.vector()
embeddingModel?: string;
embeddingGeneratedAt?: Timestamp;
domainSchemaId?: string;
```

Update `create()` to write embedding fields when present (use `FieldValue.vector()` for the embedding array).

Implement `searchSimilar()`:
```typescript
const results = await collectionRef
  .where('domainSchemaId', '==', params.domainSchemaId)
  .findNearest({
    vectorField: 'embedding',
    queryVector: FieldValue.vector(params.embedding),
    limit: params.limit ?? 5,
    distanceMeasure: 'COSINE',
    distanceResultField: '__distance',
  })
  .get();
```

Post-filter: exclude `excludeSessionId`, convert COSINE distance to similarity score (`1 - distance`), filter by minimum threshold (0.7).

**Emulator fallback:** Wrap `findNearest` in try/catch. If it throws (emulator may not support vector search), log a warning and return empty results. Never break the pipeline.

Update `entryFromDoc` to map new fields.

### Step 5: Terraform — Firestore Vector Index

**Modify:** `infra/terraform/modules/firestore/main.tf`

Add composite index:
```hcl
resource "google_firestore_index" "knowledge_entries_vector" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "knowledgeEntries"

  fields {
    field_path = "domainSchemaId"
    order      = "ASCENDING"
  }

  fields {
    field_path    = "embedding"
    vector_config {
      dimension = 768
      flat {}
    }
  }
}
```

### Step 6: Embedding Generation in persistKnowledgeEntry

**Modify:** `packages/core/src/session/session-manager.ts`

Add `embeddingClient?: EmbeddingClient` to `SessionManagerConfig`.

Update `persistKnowledgeEntry` to:
1. Build embedding text from the structured entry via `buildEmbeddingText()`
2. Call `embeddingClient.generateEmbedding(text)`
3. Add `embedding`, `embeddingModel`, `embeddingGeneratedAt` to the `CreateKnowledgeEntryInput`
4. Also add `domainSchemaId: domainConfig.name`

**Graceful degradation:** Wrap embedding generation in try/catch. If it fails, log a warning and persist the entry without an embedding. Never break the conversation.

```typescript
let embedding: number[] | undefined;
let embeddingModel: string | undefined;

if (embeddingClient) {
  try {
    const text = buildEmbeddingText(entry);
    embedding = await embeddingClient.generateEmbedding(text);
    embeddingModel = process.env['MYCEL_EMBEDDING_MODEL'] ?? 'text-multilingual-embedding-002';
  } catch (error) {
    log.warn({ error, entryId: entry.id }, 'Embedding generation failed, persisting without embedding');
  }
}
```

### Step 7: Context Dispatcher — Vector Search Integration

**Modify:** `packages/core/src/agents/context-dispatcher.ts`

Change from stub to real retrieval:
1. Accept `EmbeddingClient`, `KnowledgeRepository`, and `domainSchemaId` in `createContextDispatcherNode()`
2. Generate embedding for the current user input
3. Call `knowledgeRepository.searchSimilar()` with the input embedding
4. Build a `contextSummary` string from the results
5. Return `relevantContext` (the actual `KnowledgeSearchResult[]`) and the summary

```typescript
export function createContextDispatcherNode(deps: {
  embeddingClient?: EmbeddingClient;
  knowledgeRepository?: KnowledgeRepository;
  domainSchemaId: string;
}): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>>
```

**contextSummary format:**
```
Related knowledge already captured:
- [History] Village Church History (score: 0.87): The village church was built in 1732...
- [Nature] Local Flora (score: 0.74): The village is surrounded by old oak trees...

Total entries in domain: 12
```

If no `embeddingClient` or `knowledgeRepository` is provided, fall back to the current stub behavior (empty results). This maintains backward compatibility for tests that don't inject these deps.

**Graceful degradation:** If embedding generation or search fails, log warning and return empty context. Never break the pipeline.

### Step 8: Pipeline Wiring

**Modify:** `packages/core/src/orchestration/pipeline.ts`

Add `embeddingClient` and `knowledgeRepository` to `PipelineConfig`:
```typescript
export interface PipelineConfig {
  readonly domainConfig: DomainConfig;
  readonly personaConfig: PersonaConfig;
  readonly llmClient: LlmClient;
  readonly embeddingClient?: EmbeddingClient;
  readonly knowledgeRepository?: KnowledgeRepository;
}
```

Pass these to `createContextDispatcherNode()`:
```typescript
const contextDispatcherNode = createContextDispatcherNode({
  embeddingClient: config.embeddingClient,
  knowledgeRepository: config.knowledgeRepository,
  domainSchemaId: config.domainConfig.name,
});
```

**Modify:** `packages/core/src/session/session-manager.ts`

Pass `embeddingClient` from `SessionManagerConfig` into `PipelineConfig` and use it in `persistKnowledgeEntry`.

### Step 9: Agent Prompt Updates

**Modify:** `packages/core/src/agents/gap-reasoning.ts`

The `contextSummary` from Context Dispatcher is already included in the prompt. Now that it contains real data, add explicit instructions:

Change the prompt section from just `Existing context: ${contextSummary}` to:
```
## Already Known
${contextSummary}

IMPORTANT: Do NOT ask about information that is already captured above. Focus on gaps — what is NOT yet known. If the user shares something already in the knowledge base, acknowledge it briefly and ask about connected, unknown aspects.
```

**Modify:** `packages/core/src/agents/persona.ts`

Add context awareness. The Persona doesn't currently receive retrieved context — it only sees gaps. Add the context summary to the persona prompt:

```
## Context from Previous Knowledge
${contextSummary}

You can reference this knowledge to build on what the user has already shared.
For example: "Du hast vorhin von X erzählt — wie hängt das mit Y zusammen?"
Do NOT repeat information back to the user. Use it to ask deeper, connected questions.
```

This requires passing `contextDispatcherOutput` to the persona node, which is already available via `state.contextDispatcherOutput`.

### Step 10: Dependency Injection — API + CLI Wiring

**Modify:** `packages/api/src/app.ts`

Add `embeddingClient` to `AppDependencies`:
```typescript
export interface AppDependencies {
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly llmClient: LlmClient;
  readonly embeddingClient?: EmbeddingClient;
}
```

**Modify:** `packages/api/src/index.ts`

Create and inject the embedding client:
```typescript
import { createVertexEmbeddingClient } from '@mycel/core/src/embedding/vertex-embedding-client.js';
import { createMockEmbeddingClient } from '@mycel/core/src/embedding/mock-embedding-client.js';

const embeddingClient = process.env['MYCEL_MOCK_LLM'] === 'true'
  ? createMockEmbeddingClient()
  : createVertexEmbeddingClient();
```

**Modify:** `packages/api/src/routes/sessions.ts`

Pass `embeddingClient` through to `createSessionManager()`.

**Modify:** `scripts/run-session.ts` (if it exists)

Wire the real or mock embedding client.

### Step 11: Remove Old RAG Stub

**Delete:** `packages/core/src/rag/retriever.ts`

The `Retriever` interface and its Vertex AI Vector Search stub are superseded by the Firestore-native approach. Remove to avoid confusion.

### Step 12: Tests

**New tests:**
- `packages/core/src/embedding/embedding-client.test.ts` — Mock returns correct dimensions, batch works
- `packages/core/src/embedding/embedding-text-builder.test.ts` — Verifies text composition for various entry shapes
- `packages/core/src/agents/context-dispatcher.test.ts` — Update existing tests, add tests for:
  - Returns results when embedding client + repo are provided
  - Returns empty results when deps not provided (backward compat)
  - Graceful degradation on embedding failure
  - Graceful degradation on search failure
- `packages/core/src/repositories/in-memory-knowledge.repository.test.ts` — Add `searchSimilar` tests:
  - Returns similar entries sorted by score
  - Excludes entries from specified session
  - Respects limit
  - Handles entries without embeddings
- `packages/core/src/session/session-manager.test.ts` — Add test for:
  - Entries are persisted with embeddings when embedding client is provided
  - Entries are persisted without embeddings when embedding client is not provided
  - Pipeline still works when embedding generation fails

**Update existing tests:**
- Pipeline test may need `embeddingClient` in config (optional, so existing tests should pass without changes)
- Context dispatcher test needs updating since the signature changes
- Session manager test to verify `domainSchemaId` is passed to `create()`

## Files Changed Summary

### New Files (5)
1. `packages/core/src/embedding/embedding-client.ts` — Interface + constants
2. `packages/core/src/embedding/mock-embedding-client.ts` — Test implementation
3. `packages/core/src/embedding/vertex-embedding-client.ts` — Vertex AI implementation
4. `packages/core/src/embedding/embedding-text-builder.ts` — Text composition
5. `packages/core/src/embedding/embedding-client.test.ts` — Tests

### Modified Files (13)
1. `packages/shared/src/types/knowledge.types.ts` — Add embedding + domainSchemaId fields
2. `packages/core/src/repositories/knowledge.repository.ts` — Add searchSimilar + input fields
3. `packages/core/src/repositories/in-memory-knowledge.repository.ts` — Implement searchSimilar
4. `packages/core/src/infrastructure/firestore-knowledge.repository.ts` — Implement searchSimilar + vector storage
5. `packages/core/src/agents/context-dispatcher.ts` — Real retrieval logic
6. `packages/core/src/agents/gap-reasoning.ts` — Enhanced prompt with context
7. `packages/core/src/agents/persona.ts` — Add context awareness
8. `packages/core/src/orchestration/pipeline.ts` — Pass embedding deps
9. `packages/core/src/session/session-manager.ts` — Embedding generation + domainSchemaId
10. `packages/api/src/app.ts` — Add embeddingClient dep
11. `packages/api/src/index.ts` — Wire embedding client
12. `packages/api/src/routes/sessions.ts` — Pass embeddingClient through
13. `infra/terraform/modules/firestore/main.tf` — Vector index
14. `packages/core/package.json` — Add `@google-cloud/aiplatform`

### Updated Test Files (4)
1. `packages/core/src/agents/context-dispatcher.test.ts`
2. `packages/core/src/repositories/in-memory-knowledge.repository.test.ts`
3. `packages/core/src/session/session-manager.test.ts`
4. `packages/core/src/embedding/embedding-text-builder.test.ts` (new)

### Deleted Files (1)
1. `packages/core/src/rag/retriever.ts` — Replaced by Firestore-native approach

## Build Order

1. Types + interfaces (shared types, repository interface)
2. Embedding client (interface, mock, vertex, text builder)
3. Repository implementations (in-memory, Firestore)
4. Context Dispatcher (retrieval logic)
5. Agent prompts (gap reasoning, persona)
6. Pipeline + session manager wiring
7. API layer wiring
8. Terraform
9. Tests (throughout, but verify all pass at end)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Firestore emulator doesn't support `findNearest()` | Try/catch with empty result fallback + warning log |
| `@google-cloud/aiplatform` SDK complexity | Use `PredictionServiceClient` directly, minimal surface |
| Embedding failures block conversation | All embedding/search wrapped in try/catch, graceful degradation |
| Existing tests break from signature changes | All new params are optional, backward compatible |
| Vector index not deployed yet | Code works without index (Firestore auto-indexes), but slow without composite index |
