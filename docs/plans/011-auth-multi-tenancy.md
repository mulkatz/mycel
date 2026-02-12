# Plan 011: Authentication & Multi-Tenancy (Anonymous Auth)

See the full implementation plan in the conversation transcript.

## Summary

- GCP Identity Platform with anonymous auth
- JWT validation via `jose` + Google JWKS
- Tenant = UID from JWT `sub` claim
- Firestore path: `tenants/{tenantId}/<collection>/...`
- `search-cache` stays global
- Hybrid DI: shared deps at startup, tenant-scoped repos per-request via middleware
- Migration script for existing data → `tenants/legacy-default/`

## Key Files

- `docs/adr/013-auth-multi-tenancy.md` — Architecture decision
- `packages/api/src/middleware/auth.ts` — JWT validation
- `packages/api/src/middleware/tenant-repos.ts` — Per-request tenant repos
- `packages/core/src/infrastructure/tenant-repositories.ts` — Tenant repos factory
- `packages/core/src/infrastructure/firestore-types.ts` — FirestoreBase type
- `scripts/migrate-to-tenants.ts` — Data migration
