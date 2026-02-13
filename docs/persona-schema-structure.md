# Persona Schema Structure

Reference document for building the persona form in the Admin Dashboard.

## PersistedPersonaSchema (Firestore document)

Stored at `tenants/{tenantId}/personaSchemas/{personaSchemaId}`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name (e.g. "Community Chronicler") |
| `description` | `string?` | Optional description for admin UI |
| `version` | `number` | Integer version counter, auto-incremented on update |
| `config` | `PersonaConfig` | Full persona configuration (see below) |
| `isActive` | `boolean` | Whether this persona is currently active |
| `createdAt` | `Timestamp` | Creation timestamp |
| `updatedAt` | `Timestamp` | Last update timestamp |

## PersonaConfig (the `config` object)

Defined in `packages/schemas/src/persona.schema.ts`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Persona name (used in prompts) |
| `version` | `string` | Yes | Semver string (e.g. "1.0.0") |
| `tonality` | `string` | Yes | Conversation tone (e.g. "warm and encouraging") |
| `formality` | `'formal' \| 'informal' \| 'neutral'` | Yes | Formality level |
| `language` | `string` | Yes | ISO language code, 2-5 chars (e.g. "de", "en") |
| `addressForm` | `string` | No | How to address the user (e.g. "Du", "Sie") |
| `promptBehavior` | `PromptBehavior` | Yes | Controls AI interview behavior (see below) |
| `systemPromptTemplate` | `string` | Yes | Handlebars template for the system prompt |

## PromptBehavior (nested in config)

| Field | Type | Description |
|-------|------|-------------|
| `gapAnalysis` | `boolean` | Whether to identify knowledge gaps |
| `maxFollowUpQuestions` | `number` (0-10) | Max follow-up questions per turn |
| `encourageStorytelling` | `boolean` | Whether to encourage narrative responses |
| `validateWithSources` | `boolean` | Whether to validate claims with web sources |

## API Endpoints

- `GET /personas` — List all (returns summary without config)
- `POST /personas` — Create (requires `name` + `config`)
- `GET /personas/{id}` — Detail (includes full config)
- `PUT /personas/{id}` — Partial update (any subset of fields)
- `DELETE /personas/{id}` — Hard-delete
