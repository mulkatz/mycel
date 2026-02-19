# Implementation Plan: API Layer (Cloud Run HTTP Entrypoint)

## Overview

Add `packages/api/` using Hono to expose Mycel over HTTP. Session creation generates a proactive greeting (new capability addressing the known issue "No proactive initial question").

## Key Design Decisions

### SessionManager per request

The API supports different domain/persona schema combinations per session. On each request, the API layer looks up the session's schema names, fetches configs from `SchemaRepository`, and creates a `SessionManager`. Pipeline compilation (`StateGraph.compile()`) is synchronous and fast — acceptable overhead. Caching can be added later.

### Greeting via direct LLM call

For the initial greeting, we don't need the full 5-agent pipeline (no user input to classify or structure). A standalone `generateGreeting(personaConfig, domainConfig, llmClient)` function in `packages/core/` calls the LLM with the persona prompt + domain context to produce an opening question.

### Schema lookup by name

The API request body takes `domainSchemaId` and `personaSchemaId` — these are schema **names** (e.g., `"community-knowledge"`). The `SchemaRepository` interface needs `getDomainSchemaByName(name)` and `getPersonaSchemaByName(name)` methods added.

### Session creation flow (API vs CLI)

The API separates session creation from the first user turn:

- **POST /sessions**: Creates session record + generates greeting. No pipeline run, no turns stored.
- **POST /sessions/:id/turns** (first turn): Runs the full pipeline as turn 1.

To support this, `SessionManager` gets a new `initSession(metadata?)` method that creates the session and generates a greeting without running the pipeline. `continueSession` gets a small tweak to handle the case where `turns.length === 0` (sets `isFollowUp: false` for the first real user input).

The CLI flow (`startSession()` → `continueSession()` → `endSession()`) stays unchanged.

---

## Implementation Steps

### Step 1: Extend SchemaRepository with name lookup

**Files:**
- `packages/core/src/repositories/schema.repository.ts` — add to interface
- `packages/core/src/repositories/in-memory-schema.repository.ts` — add implementation
- `packages/core/src/infrastructure/firestore-schema.repository.ts` — add Firestore query by `name` field

```typescript
// Added to SchemaRepository interface:
getDomainSchemaByName(name: string): Promise<PersistedDomainSchema | null>;
getPersonaSchemaByName(name: string): Promise<PersistedPersonaSchema | null>;
```

In-memory: filter Map values by name. Firestore: `.where('name', '==', name).limit(1)`.

### Step 2: Add `generateGreeting()` to `packages/core/`

**New file:** `packages/core/src/session/greeting.ts`

```typescript
export async function generateGreeting(
  personaConfig: PersonaConfig,
  domainConfig: DomainConfig,
  llmClient: LlmClient,
): Promise<string>
```

System prompt: persona template + persona traits + domain description + category list. Asks the LLM to generate a warm opening question in the persona's language/style. Returns parsed response string.

**New file:** `packages/core/src/session/greeting.test.ts` — test with mock LLM that returns a fixed greeting JSON.

### Step 3: Add `initSession()` to SessionManager

**File:** `packages/core/src/session/session-manager.ts`

Add to `SessionManager` interface:

```typescript
initSession(metadata?: SessionMetadata): Promise<{ sessionId: string; greeting: string }>;
```

Implementation:
1. `sessionRepo.create({ domainConfigName, personaConfigName, metadata })`
2. `const greeting = await generateGreeting(personaConfig, domainConfig, llmClient)`
3. Return `{ sessionId: session.id, greeting }`

No pipeline run, no turn stored. The greeting is generated standalone.

### Step 4: Tweak `continueSession()` for zero-turns case

**File:** `packages/core/src/session/session-manager.ts`

When `session.turns.length === 0`, set `isFollowUp: false` in the `TurnContext`:

```typescript
const isFirstTurn = session.turns.length === 0;
const turnContext: TurnContext = {
  turnNumber,
  isFollowUp: !isFirstTurn,
  previousTurns,
  previousEntry: session.currentEntry,
  askedQuestions,
};
```

This ensures the first user turn after a greeting isn't treated as a follow-up with stale context.

**Update test:** Add a test case in `session-manager.test.ts` for `initSession()` + `continueSession()` flow.

### Step 5: Create `packages/api/` package

#### File structure

```
packages/api/
├── src/
│   ├── index.ts              # Entrypoint: wires real deps, starts Hono server
│   ├── app.ts                # createApp(deps) factory
│   ├── routes/
│   │   ├── health.ts         # GET /health
│   │   └── sessions.ts       # Session endpoints
│   ├── middleware/
│   │   ├── error-handler.ts  # Error → HTTP response mapping
│   │   └── request-id.ts     # X-Request-Id generation
│   └── schemas/
│       └── requests.ts       # Zod request body schemas
├── package.json
└── tsconfig.json
```

#### `package.json`

```json
{
  "name": "@mycel/api",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist *.tsbuildinfo",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.14.0",
    "hono": "^4.7.0",
    "@mycel/core": "*",
    "@mycel/schemas": "*",
    "@mycel/shared": "*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

#### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"],
  "references": [
    { "path": "../shared" },
    { "path": "../schemas" },
    { "path": "../core" }
  ]
}
```

#### Request schemas (`schemas/requests.ts`)

```typescript
const CreateSessionSchema = z.object({
  domainSchemaId: z.string().min(1),
  personaSchemaId: z.string().min(1),
  metadata: z.object({ source: z.string().optional() }).optional(),
});

const CreateTurnSchema = z.object({
  userInput: z.string().min(1),
});
```

#### Middleware

**`request-id.ts`**: Generate UUID, set `X-Request-Id` header, store in Hono `c.set('requestId', id)`.

**`error-handler.ts`**: `app.onError()` handler:
- `SessionError` with "not found" → 404 `SESSION_NOT_FOUND`
- `SessionError` with "already" → 409 `SESSION_COMPLETED`
- `ZodError` → 400 `VALIDATION_ERROR` with field details
- `LlmError` → 502 `LLM_ERROR` (no internal details)
- `PersistenceError` / unknown → 500 `INTERNAL_ERROR`

All errors: `{ error: string, code: string, requestId: string }`

#### `app.ts` — createApp factory

```typescript
export interface AppDependencies {
  sessionRepository: SessionRepository;
  knowledgeRepository: KnowledgeRepository;
  schemaRepository: SchemaRepository;
  llmClient: LlmClient;
}

export function createApp(deps: AppDependencies): Hono
```

- CORS middleware (allow `*`)
- Request-ID middleware
- Request logging (method, path, status, duration — structured JSON)
- Error handler
- Mount `/health` and `/sessions` routes

#### Routes

**`GET /health`** → `{ status: "ok", version: "0.1.0" }`

**`POST /sessions`**
1. Validate body with `CreateSessionSchema`
2. `schemaRepo.getDomainSchemaByName(body.domainSchemaId)` → 404 if not found
3. `schemaRepo.getPersonaSchemaByName(body.personaSchemaId)` → 404 if not found
4. Create `SessionManager` with the looked-up configs
5. Call `sessionManager.initSession({ source: 'api', ...body.metadata })`
6. Return 201: `{ sessionId, status: "active", greeting }`

**`POST /sessions/:sessionId/turns`**
1. Validate body with `CreateTurnSchema`
2. Get session from `sessionRepo.getSessionWithTurns(sessionId)` → 404 if not found
3. Check `session.status === 'active'` → 409 if not
4. Look up domain/persona schemas by session's `domainConfigName`/`personaConfigName`
5. Create `SessionManager` with those configs
6. Call `sessionManager.continueSession(sessionId, { content: body.userInput, isFollowUpResponse: session.turns.length > 0 })`
7. Return 200: `{ sessionId, turnIndex: response.turnNumber, response: response.personaResponse, knowledgeExtracted: !!response.entry, status: "active" }`

**`GET /sessions/:sessionId`**
1. `sessionRepo.getSessionWithTurns(sessionId)` → 404 if not found
2. `knowledgeRepo.getBySession(sessionId)` → count entries
3. Return 200: `{ sessionId, status, turnCount, createdAt, updatedAt, knowledgeEntryCount }`

**`POST /sessions/:sessionId/end`**
1. Get session → 404 if not found
2. Look up schemas, create SessionManager
3. `sessionManager.endSession(sessionId)`
4. Count knowledge entries
5. Return 200: `{ sessionId, status: "completed", turnCount, knowledgeEntryCount, summary }`

#### `index.ts` — Entrypoint

```typescript
import { serve } from '@hono/node-server';

const port = parseInt(process.env['PORT'] ?? '3000', 10);
const app = createApp({
  sessionRepository: createFirestoreSessionRepository(db),
  knowledgeRepository: createFirestoreKnowledgeRepository(db),
  schemaRepository: createFirestoreSchemaRepository(db),
  llmClient: await createLlmClient(),
});
serve({ fetch: app.fetch, port });
```

### Step 6: Register package in workspace

**Files to update:**
- `package.json` (root): Add `"packages/api"` to workspaces array
- `tsconfig.json` (root): Add `{ "path": "packages/api" }` to references
- `.eslintrc.json`: Add `"packages/api/tsconfig.json"` to parserOptions.project

### Step 7: Add npm scripts

**Root `package.json`:**
- `"dev:api"`: `"MYCEL_MOCK_LLM=true npx tsx packages/api/src/index.ts"` (quick local dev with mock LLM)

### Step 8: Write tests

**New file:** `packages/api/src/routes/sessions.test.ts`

Use Hono's built-in test approach (direct `app.request()` calls):

```typescript
const app = createApp({
  sessionRepository: createInMemorySessionRepository(),
  knowledgeRepository: createInMemoryKnowledgeRepository(),
  schemaRepository: seededInMemorySchemaRepo(), // pre-loaded with test schemas
  llmClient: mockLlmClient,
});

// Test with app.request(path, options)
const res = await app.request('/sessions', { method: 'POST', body: JSON.stringify({...}), headers: { 'Content-Type': 'application/json' } });
```

Test cases:
1. Health check returns 200
2. Create session returns 201 with greeting
3. Create session with unknown schema returns 404
4. Submit turn returns 200 with persona response
5. Submit turn to nonexistent session returns 404
6. Submit turn to completed session returns 409
7. Invalid request body returns 400 with validation details
8. Get session returns status and counts
9. End session returns summary
10. CORS headers present on responses

### Step 9: Dockerfile

**New file:** `packages/api/Dockerfile`

Multi-stage build:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/schemas/package*.json ./packages/schemas/
COPY packages/ingestion/package*.json ./packages/ingestion/
COPY packages/core/package*.json ./packages/core/
COPY packages/api/package*.json ./packages/api/
RUN npm ci
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ ./packages/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/
COPY --from=builder /app/packages/ingestion/dist ./packages/ingestion/dist
COPY --from=builder /app/packages/ingestion/package.json ./packages/ingestion/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/package.json ./
EXPOSE 8080
ENV PORT=8080
CMD ["node", "packages/api/dist/index.js"]
```

### Step 10: Vitest config update

Update `vitest.config.ts` to include `packages/api/src/**/*.test.ts` in the test glob (it already uses `packages/*/src/**/*.test.ts` which will match automatically).

Verify the lint script glob `packages/*/src/**/*.ts` also covers the new package (it does).

---

## What Changes in Existing Code

| File | Change |
|------|--------|
| `packages/core/src/repositories/schema.repository.ts` | Add 2 methods to interface |
| `packages/core/src/repositories/in-memory-schema.repository.ts` | Add 2 method implementations |
| `packages/core/src/infrastructure/firestore-schema.repository.ts` | Add 2 Firestore queries |
| `packages/core/src/session/session-manager.ts` | Add `initSession()`, tweak `continueSession()` isFollowUp logic |
| `packages/core/src/session/session-manager.test.ts` | Add tests for initSession + continueSession flow |
| `package.json` (root) | Add workspace, add dev:api script |
| `tsconfig.json` (root) | Add reference |
| `.eslintrc.json` | Add tsconfig path |

## What Does NOT Change

- Agent pipeline (Classifier → Context → Gap → Persona → Structuring)
- Firestore collection design
- Repository interfaces (except SchemaRepository additions)
- CLI script (`scripts/run-session.ts`)
- Existing tests

## Verification

```bash
npm run build            # All packages compile
npm run lint             # Zero errors
npm run typecheck        # Zero errors
npm run test             # All tests pass (existing + new)

# Smoke test with emulator:
npm run emulator:start
FIRESTORE_EMULATOR_HOST=localhost:8080 MYCEL_GCP_PROJECT_ID=<your-project-id> npx tsx scripts/seed-schemas.ts
FIRESTORE_EMULATOR_HOST=localhost:8080 MYCEL_GCP_PROJECT_ID=<your-project-id> npm run dev -w packages/api

curl http://localhost:3000/health
curl -X POST http://localhost:3000/sessions -H "Content-Type: application/json" \
  -d '{"domainSchemaId":"community-knowledge","personaSchemaId":"Community Chronicler"}'
# ... subsequent endpoints
```
