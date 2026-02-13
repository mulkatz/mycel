# 012 — Admin Dashboard API Endpoints

## Objective

Add domain list, persona CRUD, and knowledge entry list endpoints to support the Admin Dashboard frontend.

## Investigation Findings

### Persona Schema Structure (actual, from code)

The `PersonaConfig` type (from `packages/schemas/src/persona.schema.ts`) has these fields:

```typescript
{
  name: string;          // e.g. "Community Chronicler"
  version: string;       // semver, e.g. "1.0.0"
  tonality: string;      // e.g. "warm and encouraging"
  formality: 'formal' | 'informal' | 'neutral';
  language: string;      // e.g. "de"
  addressForm?: string;  // e.g. "Du"
  promptBehavior: {
    gapAnalysis: boolean;
    maxFollowUpQuestions: number;     // 0-10
    encourageStorytelling: boolean;
    validateWithSources: boolean;
  };
  systemPromptTemplate: string;      // Handlebars template
}
```

The persisted schema (`PersistedPersonaSchema`) wraps the config:

```typescript
{
  id: string;
  name: string;       // duplicates config.name for convenience
  version: number;     // integer version counter (not semver)
  config: PersonaConfig;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Notable:** The persisted schema does NOT have `description` or `domainSchemaId` fields. These were approximations in the prompt. The plan follows the actual code structure.

### Knowledge Entry Storage

Entries are stored **flat** in `tenants/{tenantId}/knowledgeEntries` (NOT nested under sessions). Each entry has a `domainSchemaId` field written at creation time. The existing `KnowledgeRepository.getByDomain(domainSchemaId)` method already queries by this field — no collectionGroup queries or denormalization needed.

### Routing Conflicts

The `/domains` prefix already serves three route files (documents, schema-generator, evolution). New domain admin routes (list, detail) and entry list routes will be added as another route file mounted at the same prefix. Hono resolves these correctly since existing routes use distinct sub-paths (`/generate`, `/proposals/*`, `/{id}/evolution/*`, `/{id}/documents/*`).

## Changes

### 1. Extend SchemaRepository Interface

**File:** `packages/core/src/repositories/schema.repository.ts`

Add four methods and a `description` field to `PersistedPersonaSchema`:

```typescript
interface PersistedPersonaSchema {
  // ... existing fields ...
  readonly description?: string;  // NEW — optional, for admin UI display
}

interface CreatePersonaSchemaInput {
  // ... existing fields ...
  readonly description?: string;  // NEW
}

interface UpdatePersonaSchemaInput {
  readonly name?: string;
  readonly description?: string;
  readonly config?: PersonaConfig;
  readonly isActive?: boolean;
}

interface SchemaRepository {
  // ... existing methods ...
  listDomainSchemas(filter?: { isActive?: boolean }): Promise<readonly PersistedDomainSchema[]>;
  listPersonaSchemas(): Promise<readonly PersistedPersonaSchema[]>;
  updatePersonaSchema(id: string, updates: UpdatePersonaSchemaInput): Promise<PersistedPersonaSchema>;
  deletePersonaSchema(id: string): Promise<void>;
}
```

### 2. Implement in Firestore Repository

**File:** `packages/core/src/infrastructure/firestore-schema.repository.ts`

- `listDomainSchemas`: Query `domainSchemas` collection, optionally filter by `isActive`, order by `updatedAt desc`
- `listPersonaSchemas`: Query `personaSchemas` collection, order by `updatedAt desc`
- `updatePersonaSchema`: Fetch doc by ID, apply partial updates, set new `updatedAt`, return updated doc. Throw `PersistenceError` if not found.
- `deletePersonaSchema`: Delete doc by ID. Throw `PersistenceError` if not found.

### 3. Implement in In-Memory Repository

**File:** `packages/core/src/repositories/in-memory-schema.repository.ts`

Implement the same three methods using the existing `Map` stores.

### 4. New Route: Domain Admin

**File:** `packages/api/src/routes/domain-admin.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all domain schemas (optional `?active=true` filter) |
| GET | `/{domainSchemaId}` | Get full domain schema by ID |
| GET | `/{domainSchemaId}/entries` | List knowledge entries for domain |
| GET | `/{domainSchemaId}/entries/{entryId}` | Get full entry detail |

**GET /** response:
```json
{
  "domains": [
    {
      "domainSchemaId": "abc",
      "name": "community-knowledge",
      "version": 1,
      "isActive": true,
      "origin": "web_research",
      "categoryCount": 5,
      "createdAt": "2024-...",
      "updatedAt": "2024-..."
    }
  ]
}
```

**GET /{domainSchemaId}/entries** query params: `?category=string&limit=50&offset=0`

Pagination approach: Use `getByDomain()` from `KnowledgeRepository`, then apply in-memory filtering (by category) and slicing (offset/limit). The knowledge entry count per tenant-domain is manageable for an admin view. This avoids adding a new pagination-aware repository method.

Response:
```json
{
  "entries": [
    {
      "entryId": "...",
      "sessionId": "...",
      "category": "...",
      "title": "...",
      "confidence": 0.85,
      "hasEnrichment": false,
      "createdAt": "..."
    }
  ],
  "total": 42
}
```

### 5. New Route: Personas

**File:** `packages/api/src/routes/personas.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all persona schemas |
| POST | `/` | Create a new persona schema |
| GET | `/{personaSchemaId}` | Get full persona schema |
| PUT | `/{personaSchemaId}` | Update a persona schema |
| DELETE | `/{personaSchemaId}` | Soft-delete (set `isActive=false`) |

**POST / request body:**
```json
{
  "name": "My Persona",
  "config": {
    "name": "My Persona",
    "version": "1.0.0",
    "tonality": "warm",
    "formality": "informal",
    "language": "en",
    "promptBehavior": {
      "gapAnalysis": true,
      "maxFollowUpQuestions": 3,
      "encourageStorytelling": true,
      "validateWithSources": false
    },
    "systemPromptTemplate": "You are {{name}}..."
  }
}
```

**PUT /{personaSchemaId} request body:** Partial — any subset of the POST body fields.

**DELETE /{personaSchemaId}:** Hard-delete (remove document from Firestore). Running sessions have already loaded the persona config — they don't re-read mid-session. No active session check needed. Returns `{ success: true }`. Returns 404 if not found.

### 6. Zod Schemas

**File:** `packages/api/src/schemas/responses.ts` — Add:
- `DomainSummarySchema` + `DomainListResponseSchema`
- `DomainDetailResponseSchema`
- `PersonaSummarySchema` + `PersonaListResponseSchema`
- `PersonaDetailResponseSchema`
- `PersonaCreateResponseSchema`
- `PersonaDeleteResponseSchema`
- `EntrySummarySchema` + `EntryListResponseSchema`
- `EntryDetailResponseSchema`

**File:** `packages/api/src/schemas/requests.ts` — Add:
- `ListDomainsQuerySchema` (`{ active?: boolean }`)
- `ListEntriesQuerySchema` (`{ category?, limit?, offset? }`)
- `CreatePersonaSchema` + `UpdatePersonaSchema`

### 7. Register Routes

**File:** `packages/api/src/app.ts`
```typescript
import { createDomainAdminRoutes } from './routes/domain-admin.js';
import { createPersonaRoutes } from './routes/personas.js';

// Add alongside existing /domains routes:
app.route('/domains', createDomainAdminRoutes());
app.route('/personas', createPersonaRoutes());
```

**File:** `packages/api/src/test-helpers.ts`
```typescript
// Same additions for the test app
app.route('/domains', createDomainAdminRoutes());
app.route('/personas', createPersonaRoutes());
```

### 8. Error Handling

Follow existing pattern — return structured errors inline in route handlers:
```typescript
return c.json({
  error: 'Domain schema not found: <id>',
  code: 'DOMAIN_NOT_FOUND',
  requestId: c.get('requestId'),
}, 404);
```

Error codes: `DOMAIN_NOT_FOUND`, `PERSONA_NOT_FOUND`, `ENTRY_NOT_FOUND`

### 9. Unit Tests

**File:** `packages/api/src/routes/domain-admin.test.ts`
- List domains returns empty array when none exist
- List domains returns all domains
- List domains with `?active=true` filters correctly
- Get domain by ID returns full schema
- Get domain by non-existent ID returns 404
- List entries for domain returns entries with pagination
- List entries with category filter
- Get entry by ID returns full detail
- Get entry by non-existent ID returns 404

**File:** `packages/api/src/routes/personas.test.ts`
- List personas returns empty array when none exist
- Create persona with valid input returns 201
- Create persona with invalid input returns 400
- Get persona by ID returns full schema
- Get persona by non-existent ID returns 404
- Update persona updates fields and updatedAt
- Update non-existent persona returns 404
- Delete persona sets isActive to false
- Delete non-existent persona returns 404

### 10. OpenAPI Tags

New tags for route grouping:
- `"Domains"` — domain list and detail
- `"Personas"` — persona CRUD
- `"Entries"` — entry list and detail (reuse existing tag)

## Files Changed (Summary)

| File | Action |
|------|--------|
| `packages/core/src/repositories/schema.repository.ts` | Add `listDomainSchemas`, `listPersonaSchemas`, `UpdatePersonaSchemaInput`, `updatePersonaSchema` |
| `packages/core/src/infrastructure/firestore-schema.repository.ts` | Implement new methods |
| `packages/core/src/repositories/in-memory-schema.repository.ts` | Implement new methods |
| `packages/api/src/routes/domain-admin.ts` | **New** — domain list/detail + entry list/detail |
| `packages/api/src/routes/domain-admin.test.ts` | **New** — tests |
| `packages/api/src/routes/personas.ts` | **New** — persona CRUD |
| `packages/api/src/routes/personas.test.ts` | **New** — tests |
| `packages/api/src/schemas/requests.ts` | Add request schemas |
| `packages/api/src/schemas/responses.ts` | Add response schemas |
| `packages/api/src/app.ts` | Register new routes |
| `packages/api/src/test-helpers.ts` | Register new routes |

## Out of Scope

- Cursor-based pagination (Firestore best practice) — can be added later if needed
- Domain schema CRUD (create/update/delete) — domain schemas are created via the schema generator workflow, not direct CRUD
- Active session check before persona delete — running sessions have already loaded the persona config
- Adding `domainSchemaId` to `PersistedPersonaSchema` — personas are intentionally domain-agnostic; the domain+persona combination happens at session creation
