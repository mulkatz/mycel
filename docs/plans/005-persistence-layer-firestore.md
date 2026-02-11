# Plan: Persistence Layer (Firestore)

## Overview

Add a persistence layer using Cloud Firestore (Native Mode) with the Repository Pattern. Sessions, turns, knowledge entries, and schemas are stored and retrievable. All unit tests use in-memory implementations; integration tests use the Firestore emulator.

## Key Architectural Decisions

### Bridging Existing Types with Firestore Data Model

The codebase already has well-defined types (`Session`, `Turn`, `KnowledgeEntry`) and a minimal `SessionStore` interface. The task spec proposes a richer Firestore-oriented data model. The strategy:

1. **Evolve shared types** to include the new persistence-relevant fields (e.g., `sessionId`/`turnId` on `KnowledgeEntry`, `status`/`topicKeywords` for ADR-004).
2. **Replace `SessionStore`** with the richer `SessionRepository` interface. The old `SessionStore` is too minimal (no turn queries, no update). Keep the transition clean: rename + expand, don't maintain both.
3. **Firestore converter layer** maps between domain types (with `Date`) and Firestore documents (with `Timestamp`). Domain types remain Firestore-agnostic.

### Turns as Subcollection

The current `Session` type embeds `turns: readonly Turn[]` as an in-memory array. For Firestore, turns become a subcollection (`sessions/{id}/turns/{turnId}`). Implications:

- `SessionRepository.getById()` returns the session document **without** turns (lightweight).
- `SessionRepository.getTurns()` fetches turns separately when needed.
- The `SessionManager` calls both when it needs the full session. We add a convenience `getSessionWithTurns()` method.
- The existing `Session` type keeps its `turns` field for in-memory usage. A new `SessionDocument` type (Firestore-specific) omits it.

### KnowledgeEntry Enhancement

The existing `KnowledgeEntry` lacks fields needed for ADR-004 persistence (`sessionId`, `turnId`, `confidence`, `suggestedCategoryLabel`, `topicKeywords`, `rawInput`, `status`, `migratedFrom`, `migratedAt`). These will be added to the shared type since they're core domain concepts, not Firestore-specific.

## Package Structure

All persistence code goes in `packages/core` since it's the engine package. New directory layout:

```
packages/core/src/
├── repositories/
│   ├── session.repository.ts          # SessionRepository interface
│   ├── knowledge.repository.ts        # KnowledgeRepository interface
│   ├── schema.repository.ts           # SchemaRepository interface
│   ├── in-memory-session.repository.ts      # + test
│   ├── in-memory-knowledge.repository.ts    # + test
│   └── in-memory-schema.repository.ts       # + test
├── infrastructure/
│   ├── firestore-client.ts            # Firestore client factory
│   ├── firestore-session.repository.ts      # + integration test
│   ├── firestore-knowledge.repository.ts    # + integration test
│   ├── firestore-schema.repository.ts       # + integration test
│   └── firestore-converters.ts        # Date ↔ Timestamp, domain ↔ Firestore mapping
├── session/
│   ├── session-manager.ts             # Updated to use SessionRepository + KnowledgeRepository
│   ├── session-store.ts               # DELETED (replaced by repositories)
│   ├── in-memory-session-store.ts     # DELETED (replaced by InMemorySessionRepository)
│   └── ...
```

## Implementation Phases

### Phase 1: Evolve Shared Types

**Files changed:**
- `packages/shared/src/types/knowledge.types.ts` – Add persistence fields
- `packages/shared/src/types/session.types.ts` – Add `metadata` field to Session

**Changes to `KnowledgeEntry`:**
```typescript
export interface KnowledgeEntry {
  // Existing fields unchanged
  readonly id: string;
  readonly categoryId: string;
  readonly subcategoryId?: string;
  readonly title: string;
  readonly content: string;
  readonly source: KnowledgeSource;
  readonly structuredData: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly followUp?: KnowledgeFollowUp;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // New persistence fields (ADR-004)
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly confidence?: number;
  readonly suggestedCategoryLabel?: string;
  readonly topicKeywords?: readonly string[];
  readonly rawInput?: string;
  readonly status?: 'draft' | 'confirmed' | 'migrated';
  readonly migratedFrom?: string;
  readonly migratedAt?: Date;
}
```

All new fields are optional to maintain backward compatibility – existing agent code and tests continue to work without changes.

**Changes to `Session`:**
```typescript
export interface Session {
  // Existing fields unchanged
  readonly id: string;
  readonly domainConfigName: string;
  readonly personaConfigName: string;
  readonly status: SessionStatus;
  readonly turns: readonly Turn[];
  readonly currentEntry?: KnowledgeEntry;
  readonly classifierResult?: ClassifierOutput;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // New field for extensible metadata
  readonly metadata?: SessionMetadata;
}

export interface SessionMetadata {
  readonly source?: 'cli' | 'api' | 'web';
  readonly userId?: string;
}
```

**Changes to `Turn`:**
```typescript
export interface Turn {
  readonly id?: string;           // NEW: auto-generated for Firestore doc ID
  readonly turnNumber: number;
  readonly input: TurnInput;
  readonly pipelineResult: PipelineState;
  readonly timestamp: Date;
}
```

Add `id` as optional – the in-memory implementation doesn't need it, but Firestore does.

### Phase 2: Repository Interfaces

**New files:**
- `packages/core/src/repositories/session.repository.ts`
- `packages/core/src/repositories/knowledge.repository.ts`
- `packages/core/src/repositories/schema.repository.ts`

```typescript
// session.repository.ts
export interface CreateSessionInput {
  readonly domainConfigName: string;
  readonly personaConfigName: string;
  readonly metadata?: SessionMetadata;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<Session>;
  getById(id: string): Promise<Session | null>;
  update(id: string, updates: UpdateSessionInput): Promise<void>;
  addTurn(sessionId: string, turn: CreateTurnInput): Promise<Turn>;
  getTurns(sessionId: string): Promise<readonly Turn[]>;
  getSessionWithTurns(id: string): Promise<Session | null>;
}
```

```typescript
// knowledge.repository.ts
export interface CreateKnowledgeEntryInput {
  readonly sessionId: string;
  readonly turnId: string;
  readonly categoryId: string;
  readonly confidence: number;
  readonly suggestedCategoryLabel: string;
  readonly topicKeywords: readonly string[];
  readonly rawInput: string;
  readonly title: string;
  readonly content: string;
  readonly source: KnowledgeSource;
  readonly structuredData: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly followUp?: KnowledgeFollowUp;
}

export interface KnowledgeRepository {
  create(input: CreateKnowledgeEntryInput): Promise<KnowledgeEntry>;
  getById(id: string): Promise<KnowledgeEntry | null>;
  getBySession(sessionId: string): Promise<readonly KnowledgeEntry[]>;
  getByCategory(category: string): Promise<readonly KnowledgeEntry[]>;
  getUncategorized(): Promise<readonly KnowledgeEntry[]>;
  queryByTopicKeywords(keywords: readonly string[]): Promise<readonly KnowledgeEntry[]>;
  update(id: string, updates: Partial<KnowledgeEntry>): Promise<void>;
}
```

```typescript
// schema.repository.ts
export interface SchemaRepository {
  getDomainSchema(id: string): Promise<PersistedDomainSchema | null>;
  getActiveDomainSchema(): Promise<PersistedDomainSchema | null>;
  saveDomainSchema(input: CreateDomainSchemaInput): Promise<PersistedDomainSchema>;
  getPersonaSchema(id: string): Promise<PersistedPersonaSchema | null>;
  getActivePersonaSchema(): Promise<PersistedPersonaSchema | null>;
  savePersonaSchema(input: CreatePersonaSchemaInput): Promise<PersistedPersonaSchema>;
}
```

The `PersistedDomainSchema` / `PersistedPersonaSchema` types wrap the existing `DomainConfig` / `PersonaConfig` with persistence metadata (`id`, `version`, `isActive`, `createdAt`, `updatedAt`). These types go in `packages/shared/src/types/schema.types.ts`.

### Phase 3: In-Memory Repository Implementations

**New files:**
- `packages/core/src/repositories/in-memory-session.repository.ts`
- `packages/core/src/repositories/in-memory-session.repository.test.ts`
- `packages/core/src/repositories/in-memory-knowledge.repository.ts`
- `packages/core/src/repositories/in-memory-knowledge.repository.test.ts`
- `packages/core/src/repositories/in-memory-schema.repository.ts`
- `packages/core/src/repositories/in-memory-schema.repository.test.ts`

Each implementation stores data in `Map<string, T>`. Tests verify all interface methods. These replace the existing `InMemorySessionStore` for unit testing.

### Phase 4: Update SessionManager to Use Repositories

**Files changed:**
- `packages/core/src/session/session-manager.ts` – Use `SessionRepository` + `KnowledgeRepository` instead of `SessionStore`
- `packages/core/src/session/session-manager.test.ts` – Use in-memory repositories
- **Delete** `packages/core/src/session/session-store.ts`
- **Delete** `packages/core/src/session/in-memory-session-store.ts`
- **Delete** `packages/core/src/session/in-memory-session-store.test.ts`

**Changes to `SessionManagerConfig`:**
```typescript
export interface SessionManagerConfig {
  readonly pipelineConfig: PipelineConfig;
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository: KnowledgeRepository;
}
```

**Integration points:**
- `startSession()` → `sessionRepository.create()` + `sessionRepository.addTurn()` + `knowledgeRepository.create()`
- `continueSession()` → `sessionRepository.getSessionWithTurns()` + `sessionRepository.addTurn()` + `sessionRepository.update()` + `knowledgeRepository.create()`
- `endSession()` → `sessionRepository.update()` (status change)
- Knowledge entry creation happens when structuring produces output: the entry from `StructuringOutput` is enriched with `sessionId`, `turnId`, `confidence`, etc. and persisted via `knowledgeRepository.create()`.

### Phase 5: Firestore Client & Converters

**New files:**
- `packages/core/src/infrastructure/firestore-client.ts`
- `packages/core/src/infrastructure/firestore-converters.ts`

**Firestore client factory:**
```typescript
import { Firestore } from '@google-cloud/firestore';

export function createFirestoreClient(): Firestore {
  return new Firestore({
    projectId: process.env['MYCEL_GCP_PROJECT_ID'],
  });
}
```

**Converters** handle:
- `Date` → `Timestamp` (write) and `Timestamp` → `Date` (read)
- `readonly` arrays → mutable arrays for Firestore
- Stripping `undefined` optional fields before writing
- Reconstructing domain types with full type safety from Firestore snapshots

### Phase 6: Firestore Repository Implementations

**New files:**
- `packages/core/src/infrastructure/firestore-session.repository.ts`
- `packages/core/src/infrastructure/firestore-knowledge.repository.ts`
- `packages/core/src/infrastructure/firestore-schema.repository.ts`

**Collection paths:**
- `sessions/{sessionId}` – Session documents (without embedded turns)
- `sessions/{sessionId}/turns/{turnId}` – Turn subcollection
- `knowledgeEntries/{entryId}` – Top-level knowledge entries
- `domainSchemas/{schemaId}` – Domain schema documents
- `personaSchemas/{schemaId}` – Persona schema documents

**Key implementation details:**
- Each repository receives a `Firestore` instance via constructor (dependency injection).
- `FirestoreSessionRepository.getSessionWithTurns()` reads the session doc + all turns, then assembles the full `Session` object.
- `FirestoreKnowledgeRepository.getUncategorized()` queries `category == '_uncategorized'`.
- `FirestoreKnowledgeRepository.queryByTopicKeywords()` uses `array-contains-any` on `topicKeywords`.
- All writes use auto-generated IDs via `doc().id` or `add()`.

**New dependency:**
- Add `@google-cloud/firestore` to `packages/core/package.json`

### Phase 7: Firestore Indexes

**New file:** `firestore.indexes.json` at project root.

Composite indexes needed:
- `knowledgeEntries`: `category` ASC + `createdAt` DESC
- `knowledgeEntries`: `status` ASC + `createdAt` DESC
- `knowledgeEntries`: `sessionId` ASC + `createdAt` DESC

### Phase 8: Integration Tests

**New files:**
- `packages/core/src/infrastructure/firestore-session.repository.integration.test.ts`
- `packages/core/src/infrastructure/firestore-knowledge.repository.integration.test.ts`
- `packages/core/src/infrastructure/firestore-schema.repository.integration.test.ts`

**New config:** `vitest.integration.config.ts` at project root, separate from unit tests.

**New scripts in root `package.json`:**
```json
{
  "test:integration": "FIRESTORE_EMULATOR_HOST=localhost:8080 vitest run --config vitest.integration.config.ts",
  "emulator:start": "gcloud emulators firestore start --host-port=localhost:8080"
}
```

Tests cover:
- Full CRUD on sessions (create, read, update status)
- Turn subcollection (add turns, get turns, order by index)
- Knowledge entry CRUD + queries (by category, by session, uncategorized, by topicKeywords)
- Schema save/load + getActive queries
- Data isolation between tests (clear collections before each test)

### Phase 9: Seed Script

**New file:** `scripts/seed-schemas.ts`

Reads `config/domain.json` and `config/persona.json`, validates them, and writes them to the `domainSchemas` and `personaSchemas` collections with `isActive: true`. Idempotent – checks if an active schema with the same name + version already exists.

### Phase 10: Update run-session.ts

**File changed:** `scripts/run-session.ts`

Add Firestore support:
- If `FIRESTORE_EMULATOR_HOST` is set, use `FirestoreSessionRepository` + `FirestoreKnowledgeRepository`.
- Otherwise, fall back to in-memory repositories (existing behavior).
- After session ends, log persisted knowledge entries.

### Phase 11: Environment & Configuration

**Files changed:**
- `.env.example` – Add `MYCEL_GCP_PROJECT_ID` and `FIRESTORE_EMULATOR_HOST`

**New error type in `packages/shared/src/utils/errors.ts`:**
```typescript
export class PersistenceError extends MycelError {
  constructor(message: string, cause?: Error) {
    super(message, 'PERSISTENCE_ERROR', cause);
    this.name = 'PersistenceError';
  }
}
```

## Execution Order

| Step | Phase | Dependencies | Estimated Files |
|------|-------|-------------|----------------|
| 1 | Phase 1: Evolve shared types | None | 3 changed |
| 2 | Phase 2: Repository interfaces | Phase 1 | 4 new |
| 3 | Phase 3: In-memory implementations + tests | Phase 2 | 6 new |
| 4 | Phase 4: Update SessionManager | Phase 3 | 3 changed, 3 deleted |
| 5 | Phase 5: Firestore client & converters | Phase 1 | 2 new |
| 6 | Phase 6: Firestore repositories | Phase 2, 5 | 3 new |
| 7 | Phase 7: Firestore indexes | None | 1 new |
| 8 | Phase 8: Integration tests | Phase 6 | 4 new |
| 9 | Phase 9: Seed script | Phase 6 | 1 new |
| 10 | Phase 10: Update run-session.ts | Phase 6 | 1 changed |
| 11 | Phase 11: Env + error type | Phase 1 | 2 changed |

Phases 1–4 can be built and verified with `npm run build && npm run test` at each step.
Phases 5–6 can be built and typechecked but require the emulator for runtime testing.
Phases 7–9 are wired up and tested with `npm run test:integration`.

## What's NOT Included

- Migration logic for `_uncategorized` → real category
- Schema suggestion / clustering logic
- Authentication or access control
- Terraform provisioning for Firestore
- Cloud Storage integration

## Verification

```bash
npm run build        # Zero errors
npm run lint         # Zero errors
npm run typecheck    # Zero errors
npm run test         # All unit tests pass (in-memory repositories)
npm run test:integration  # All integration tests pass (emulator)
npx tsx scripts/seed-schemas.ts  # Seeds schemas into emulator
```
