# ADR-013: Authentication & Multi-Tenancy

## Status

Accepted

## Context

Mycel has no authentication — all API endpoints are open and all Firestore data lives in flat, globally accessible collections. Before building a frontend or supporting multiple users, we need tenant isolation and token-based auth.

## Decision

### Authentication Provider

Use **GCP Identity Platform** (not Firebase Auth) for consistency with the pure-GCP stack. Start with **anonymous auth** — users get an isolated data space without requiring account creation. Named identity providers (Google, email/password) can be added later without architectural changes.

### Tenant Model

- Tenant = Identity Platform UID (`sub` claim from JWT)
- Every authenticated user gets their own isolated data space
- JWT validation via `jose` library + Google JWKS endpoint (`securetoken.google.com`)
- Token expiry: 1 hour, client-side refresh required

### Firestore Data Layout

All tenant-specific data moves under `tenants/{tenantId}/<collection>/...`:

```
tenants/
  {tenantId}/
    sessions/
      {sessionId}/
        turns/
    knowledgeEntries/
    domainSchemas/
    personaSchemas/
    schema-proposals/
    evolution-proposals/
    field-stats/
    generated-documents/
    schema-evolution-log/
search-cache/          ← stays global (not tenant-scoped)
```

### Global Collections

`search-cache` stays global. Rationale: web search results are objective factual data, not user-generated content. Sharing the cache across tenants saves cost and improves cache hit rates.

### Dependency Injection: Hybrid Approach

- **Shared deps** (llmClient, embeddingClient, webSearchClient, searchCacheRepository) are created once at startup and shared across all requests
- **Tenant-scoped repos** are created per-request by middleware and stored in Hono context
- **Services** (documentGenerator, schemaEvolutionService, etc.) are created per-request since they wrap tenant-scoped repos

### Migration

Existing data moves under `tenants/legacy-default/` via a one-time migration script. The script is idempotent — it checks for existing target docs before copying.

## Consequences

### Positive

- Complete data isolation between users
- JWT validation is stateless — no session store needed
- Anonymous auth provides zero-friction onboarding
- `FirestoreBase` type abstraction makes tenant scoping transparent to business logic
- Search cache sharing reduces cost

### Negative

- Per-request repo creation adds slight overhead (object allocation, not network calls)
- Schema repo now uses `db.runTransaction()` which requires the root `Firestore` instance — schema repo factories need access to both `FirestoreBase` (for collection paths) and `Firestore` (for transactions)
- Existing data requires migration

### Risks

- Anonymous users who clear browser storage lose access to their data (mitigated: can link accounts later)
- JWKS fetch on cold start adds ~100ms to first request (mitigated: `jose` caches JWKS internally)
