# ADR-006: Persistence Layer — Firestore Native Mode

## Status

Accepted

## Date

2026-02-11

## Context

Mycel's initial implementation stored all state in memory — sessions, turns, and knowledge entries lived only for the duration of a process. To build a real product, we need durable storage that:

- Persists sessions and knowledge entries across server restarts
- Supports queries by category, session, and topic keywords
- Integrates naturally with the existing GCP stack (ADR-002)
- Enables emulator-based testing without cloud credentials
- Keeps the domain layer independent of the storage technology

The data model involves three main entities: Sessions (with Turns as a sub-entity), Knowledge Entries, and Schemas (Domain + Persona). Sessions have a one-to-many relationship with Turns and Knowledge Entries.

## Decision

### Firestore Native Mode

Use Cloud Firestore in Native Mode as the primary database.

Alternatives considered:
- **Firestore Datastore Mode**: Simpler key-value model, but lacks real-time capabilities and has a less expressive query language. Native Mode's document model maps naturally to our domain types.
- **MongoDB Atlas**: Mature document database, but adds a non-GCP dependency to manage, and Firestore's free tier and serverless scaling are better suited for a dev-stage project.
- **PostgreSQL (Cloud SQL)**: Strong relational model, but our data is document-shaped (nested objects, variable fields per category). An ORM would add friction, and Cloud SQL requires always-on instances.

Firestore Native Mode was chosen because:
- Serverless — no instance management, scales to zero
- Native GCP integration — same auth, same project, same billing
- Document model matches our domain types (sessions, entries, schemas are JSON-like)
- Built-in emulator for local development and integration testing
- Composite indexes for the queries we need (by category + date, by session, etc.)

### Repository Pattern

All data access goes through repository interfaces (`SessionRepository`, `KnowledgeRepository`, `SchemaRepository`). Repositories are injected via constructor, never imported directly.

Each interface has two implementations:
- **In-memory**: `Map<string, T>`-based, used in unit tests
- **Firestore**: Uses `@google-cloud/firestore` SDK, used in production and integration tests

This keeps the domain layer (agents, session manager, pipeline) completely independent of Firestore. Switching databases would mean writing new repository implementations without touching business logic.

### Collection Structure

```
sessions/{sessionId}                    # Session document (without turns)
sessions/{sessionId}/turns/{turnId}     # Turn subcollection
knowledgeEntries/{entryId}              # Top-level collection
domainSchemas/{schemaId}                # Domain schema documents
personaSchemas/{schemaId}               # Persona schema documents
```

Key design choices:
- **Turns as subcollection**, not embedded array: Sessions can have many turns; embedding them would hit Firestore's 1MB document limit and make individual turn queries expensive. The subcollection allows fetching sessions without turns (lightweight) or with turns (full context).
- **Knowledge Entries as top-level collection**: Entries reference their session via `sessionId` field, not as a subcollection. This enables cross-session queries (by category, by domain, by topic keywords) without collection group queries.
- **Schemas as separate collections**: Domain and persona schemas are independent entities with their own lifecycle (versioning, `isActive` flag).

### Converter Layer

A dedicated converter layer maps between domain types (using `Date`, `readonly` arrays) and Firestore documents (using `Timestamp`, mutable arrays). Domain types remain Firestore-agnostic — no `Timestamp` imports leak into business logic.

### Emulator-Based Integration Testing

Integration tests run against the Firestore emulator (`localhost:8080`), not against a real Firestore instance. Tests are isolated from unit tests via a separate Vitest config (`vitest.integration.config.ts`) and excluded from `npm test`.

Each test suite clears its collections before each test to ensure isolation.

## Consequences

### Positive

- Domain layer is database-agnostic — repositories can be swapped without business logic changes
- In-memory implementations make unit tests fast and deterministic (no I/O)
- Firestore emulator enables realistic integration tests without cloud costs or credentials
- Serverless scaling matches Cloud Run's scale-to-zero model (no idle database costs)
- Document model avoids impedance mismatch — domain types map naturally to Firestore documents

### Negative

- Two implementations per repository to maintain (in-memory + Firestore)
- Firestore's query limitations (no joins, limited inequality filters) constrain future query patterns
- The converter layer adds boilerplate for every entity type
- Firestore emulator doesn't support all features (notably vector search — see ADR-007)
- Composite indexes must be explicitly defined and deployed
