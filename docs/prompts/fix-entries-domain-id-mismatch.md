# Fix: Knowledge entries not visible in admin dashboard

## Problem

The admin dashboard's entries section (`/domains/{id}/entries`) shows no knowledge entries, even though entries were created during chat sessions.

## Root Cause

**domainSchemaId mismatch between storage and query.** Same class of bug as the SESSION_NOT_FOUND issue fixed in `89bb4ec`.

When knowledge entries are created in `packages/core/src/session/session-manager.ts` (line 158), they store:
```typescript
domainSchemaId: domainConfig.name   // e.g. "franz-benthin" (the schema config name)
```

When the admin dashboard lists entries via `GET /domains/{domainSchemaId}/entries` (`packages/api/src/routes/domain-admin.ts`, line 204):
```typescript
let entries = await knowledgeRepository.getByDomain(domainSchemaId);
```
The `domainSchemaId` URL param is the **Firestore document ID** (e.g. `"E9HooieNS5vpeTBvYxFg"`), not the schema name. The query filters `where('domainSchemaId', '==', 'E9HooieNS5vpeTBvYxFg')` but entries have `domainSchemaId: 'franz-benthin'`. No match.

## Fix

### 1. Fix the query in `domain-admin.ts` listEntriesRoute (line 204)

The handler already resolves the domain schema at line 192 (`getDomainSchema(domainSchemaId)`). Use the resolved schema's `name` field to query entries:

```typescript
// Before (broken):
let entries = await knowledgeRepository.getByDomain(domainSchemaId);

// After (fixed):
let entries = await knowledgeRepository.getByDomain(domain.name);
```

### 2. Audit all other `getByDomain` call sites

Search for every call to `knowledgeRepository.getByDomain()` and `knowledgeRepository.getUncategorizedByDomain()` across the codebase. Each one receives a `domainSchemaId` parameter — verify whether it's passing the schema **name** (correct, matches what entries store) or the Firestore **doc ID** (incorrect).

Key files to check:
- `packages/api/src/routes/domain-admin.ts` — listEntriesRoute, getEntryRoute
- `packages/api/src/routes/entries.ts` — any entry listing endpoints
- `packages/core/src/services/schema-evolution/schema-evolution.ts` — evolution analysis
- `packages/core/src/services/document-generator/document-generator.ts` — document generation
- Any other consumer of `KnowledgeRepository.getByDomain()`

### 3. Audit `searchSimilar` calls

The vector search method also accepts a `domainSchemaId` filter. Check `packages/core/src/infrastructure/firestore-knowledge.repository.ts` for how `searchSimilar` uses it, and verify callers pass the name, not the doc ID.

### 4. Fix existing Firestore data (if needed)

Check whether any knowledge entries were stored with a Firestore doc ID instead of the schema name. If so, write a migration script to fix them (similar to the persona name fix in the previous commit).

Run this diagnostic:
```typescript
// For each tenant, compare entry.domainSchemaId against known schema names
// If entry.domainSchemaId matches a Firestore doc ID instead of a name, fix it
```

### 5. Consider a longer-term convention

The codebase has two identifiers for schemas: the Firestore doc ID and the config name. This ambiguity causes repeated bugs. Consider:
- Always using `domain.name` (config name) as the canonical identifier in application logic
- Only using Firestore doc IDs for direct document lookups
- Documenting this convention in CLAUDE.md

## Key Files

- `packages/api/src/routes/domain-admin.ts` — the broken list handler (line 204)
- `packages/core/src/infrastructure/firestore-knowledge.repository.ts` — `getByDomain()` implementation (line 259)
- `packages/core/src/session/session-manager.ts` — entry creation with `domainSchemaId: domainConfig.name` (line 158)
- `packages/core/src/repositories/knowledge.repository.ts` — repository interface

## Verification

After fixing, create a session, send a turn to generate a knowledge entry, then check the admin dashboard entries section. The entry should appear.
