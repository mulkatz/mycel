# Plan: Document Generator Service

## Overview

Build a standalone Document Generator service that reads all Knowledge Entries for a domain from Firestore and produces readable Markdown documentation — structured like a local knowledge book with chapters, prose, and gap indicators.

## Key Decisions

1. **No new repository interface for generated documents.** Store the output in Firestore using the existing `Firestore` client directly within the service (single document per domain in `generated-documents` collection). This avoids adding a full repository abstraction for what is essentially a write-once-read blob.

2. **Need a new `getByDomain` method on `KnowledgeRepository`.** The existing repository has `getByCategory` and `getBySession` but no way to fetch all entries for a `domainSchemaId`. This is the only change to existing interfaces.

3. **LLM client reuse.** The Chapter Writer uses the same `LlmClient` interface and Gemini model. Since we need free-form Markdown output (not JSON), we'll create a dedicated `createTextLlmClient()` that sets `responseMimeType: 'text/plain'` instead of `application/json`. This avoids modifying the existing JSON-focused client.

4. **Gap Analyzer is rule-based.** No LLM call needed — compare schema `requiredFields`/`optionalFields` against `structuredData` keys and entry count per category.

## Implementation Steps

### Step 1: Add `getByDomain` to KnowledgeRepository

**Files:**
- `packages/core/src/repositories/knowledge.repository.ts` — add method to interface
- `packages/core/src/infrastructure/firestore-knowledge.repository.ts` — Firestore impl
- `packages/core/src/repositories/in-memory-knowledge.repository.ts` — in-memory impl

```typescript
// Add to KnowledgeRepository interface:
getByDomain(domainSchemaId: string): Promise<readonly KnowledgeEntry[]>;
```

Firestore impl: query `where('domainSchemaId', '==', domainSchemaId)` ordered by `createdAt asc`.

In-memory impl: filter entries by `domainSchemaId`.

### Step 2: Create text-mode LLM client

**File:** `packages/core/src/llm/text-llm-client.ts`

A variant of the LLM client that returns plain text instead of JSON. Same retry/error handling logic, but:
- `responseMimeType: 'text/plain'` instead of `'application/json'`
- No JSON extraction/parsing — returns raw string content
- Separate `TextLlmClient` interface with `invoke(request: LlmRequest): Promise<TextLlmResponse>` where `TextLlmResponse.content` is plain text

Mock client returns simple placeholder Markdown for tests.

### Step 3: Create Document Generator types

**File:** `packages/core/src/services/document-generator/types.ts`

```typescript
export interface DocumentGeneratorDeps {
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly textLlmClient: TextLlmClient;
  readonly firestoreClient: Firestore;
}

export interface GenerateDocumentParams {
  readonly domainSchemaId: string;
}

export interface ChapterPlan {
  readonly chapterNumber: number;
  readonly categoryId: string;
  readonly title: string;
  readonly filename: string;
  readonly entries: readonly KnowledgeEntry[];
}

export interface ChapterResult {
  readonly filename: string;
  readonly title: string;
  readonly content: string;
  readonly entryCount: number;
  readonly gapCount: number;
  readonly gaps: readonly GapHint[];
}

export interface GapHint {
  readonly field: string;
  readonly description: string;
}

export interface DocumentMeta {
  readonly generatedAt: string;
  readonly domainSchemaId: string;
  readonly contentLanguage: string;
  readonly totalEntries: number;
  readonly totalChapters: number;
  readonly chaptersWithContent: number;
  readonly chaptersEmpty: number;
  readonly gapsIdentified: number;
  readonly sourceEntryIds: readonly string[];
  readonly generationDurationMs: number;
}

export interface GeneratedDocument {
  readonly meta: DocumentMeta;
  readonly chapters: readonly ChapterResult[];
  readonly indexContent: string;
}
```

### Step 4: Implement Document Generator sub-modules

**Directory:** `packages/core/src/services/document-generator/`

#### 4a. `entry-collector.ts`
- Takes `KnowledgeRepository` + `domainSchemaId`
- Calls `getByDomain(domainSchemaId)`
- Groups entries by `categoryId` into a `Map<string, KnowledgeEntry[]>`
- Sorts each group by `createdAt` ascending
- Returns the grouped map

#### 4b. `chapter-planner.ts`
- Takes grouped entries map + `DomainConfig`
- For each category in the schema (in schema order), creates a `ChapterPlan`
- Assigns chapter numbers starting at 1
- Uses category `label` as chapter title
- Generates filename: `{nn}-{categoryId}.md` (e.g., `01-history.md`)
- Appends `_uncategorized` entries as final chapter titled "Miscellaneous" if any exist
- Categories with 0 entries still get a plan (empty chapter stub)

#### 4c. `chapter-writer.ts`
- Takes a `ChapterPlan` + `DomainConfig` + `TextLlmClient`
- If 0 entries: returns a short stub ("No information has been collected yet for this topic.")
- If entries exist: calls LLM with system prompt + all entry data
- System prompt instructs: local knowledge book tone, fact-based only, match content language, don't pad
- Returns the Markdown string for the chapter

#### 4d. `gap-analyzer.ts`
- Takes entries for a category + category schema (requiredFields, optionalFields)
- Rule-based (no LLM):
  - If category has 0 entries → gap: "No entries collected"
  - For each `requiredField` in schema: check how many entries have it in `structuredData` → report missing ones
  - For entries with low confidence (< 0.5): flag as uncertain
- Returns `GapHint[]`
- The caller (chapter-writer or orchestrator) appends gap hints as an italicized block at the end of each chapter

#### 4e. `index-generator.ts`
- Takes `DomainConfig` + `ChapterResult[]` + `DocumentMeta`
- Generates `index.md` with:
  - Domain title (`# {domain.name}`)
  - Domain description
  - Table of contents with chapter links
  - Summary stats
  - Generation timestamp

### Step 5: Implement main orchestrator

**File:** `packages/core/src/services/document-generator/document-generator.ts`

```typescript
export function createDocumentGenerator(deps: DocumentGeneratorDeps): DocumentGenerator {
  return {
    async generate(params: GenerateDocumentParams): Promise<GeneratedDocument> {
      const startTime = Date.now();

      // 1. Load domain schema
      // 2. Collect entries
      // 3. Plan chapters
      // 4. Write chapters (sequentially to avoid LLM rate limits)
      // 5. Analyze gaps per chapter, append to content
      // 6. Generate index
      // 7. Build meta
      // 8. Save to Firestore (generated-documents/{domainSchemaId})
      // 9. Return result
    },
  };
}
```

Firestore storage: single document at `generated-documents/{domainSchemaId}` with fields:
- `generatedAt: Timestamp`
- `meta: object` (the DocumentMeta)
- `chapters: Record<filename, string>` (Markdown content per chapter)
- `indexContent: string` (the index.md content)

### Step 6: Add API routes

**File:** `packages/api/src/routes/documents.ts`

```typescript
export function createDocumentRoutes(deps: DocumentRouteDeps): Hono<AppEnv> {
  const docs = new Hono<AppEnv>();

  // POST /domains/:domainSchemaId/documents/generate
  docs.post('/:domainSchemaId/documents/generate', async (c) => { ... });

  // GET /domains/:domainSchemaId/documents/latest
  docs.get('/:domainSchemaId/documents/latest', async (c) => { ... });

  // GET /domains/:domainSchemaId/documents/latest/meta
  docs.get('/:domainSchemaId/documents/latest/meta', async (c) => { ... });

  // GET /domains/:domainSchemaId/documents/latest/:filename
  docs.get('/:domainSchemaId/documents/latest/:filename', async (c) => { ... });

  return docs;
}
```

**Wire into app:**
- Add `textLlmClient` and `firestoreClient` (raw `Firestore` instance) to `AppDependencies`
- Register route: `app.route('/domains', createDocumentRoutes(deps))`

**Route details:**
- POST generate: validate domainSchemaId exists, call `documentGenerator.generate()`, return meta + chapter summaries as JSON
- GET latest: return `indexContent` as `text/markdown`
- GET latest/meta: return meta as JSON
- GET latest/:filename: look up `chapters[filename]`, return as `text/markdown`, 404 if not found

### Step 7: Write tests

#### Unit tests (co-located):

- `entry-collector.test.ts` — groups entries correctly, handles empty, handles uncategorized
- `chapter-planner.test.ts` — correct ordering, numbering, filenames, empty categories
- `chapter-writer.test.ts` — calls LLM with correct prompt, handles empty entries, returns stub
- `gap-analyzer.test.ts` — detects missing required fields, handles no entries, handles complete entries
- `index-generator.test.ts` — correct TOC, stats, formatting
- `document-generator.test.ts` — end-to-end orchestration with mocks

#### API route tests:

- `documents.test.ts` — POST triggers generation, GET returns content, 404 for missing domain/chapter

All tests use in-memory repositories and mock LLM client.

### Step 8: Update `AppDependencies` and `index.ts`

**File:** `packages/api/src/index.ts`

Add `textLlmClient` creation (reuse existing Vertex AI config but with text mode) and pass raw `db` to document routes.

**File:** `packages/api/src/app.ts`

Add `textLlmClient: TextLlmClient` and `firestoreClient: Firestore` to `AppDependencies`, wire document routes.

## Files Created/Modified Summary

### New files:
1. `packages/core/src/llm/text-llm-client.ts` — Text-mode LLM client
2. `packages/core/src/services/document-generator/types.ts` — Type definitions
3. `packages/core/src/services/document-generator/entry-collector.ts` — Entry collection
4. `packages/core/src/services/document-generator/chapter-planner.ts` — Chapter planning
5. `packages/core/src/services/document-generator/chapter-writer.ts` — LLM-powered chapter writing
6. `packages/core/src/services/document-generator/gap-analyzer.ts` — Rule-based gap analysis
7. `packages/core/src/services/document-generator/index-generator.ts` — Index/TOC generation
8. `packages/core/src/services/document-generator/document-generator.ts` — Main orchestrator
9. `packages/api/src/routes/documents.ts` — API routes
10. Tests for each of the above (co-located `*.test.ts`)

### Modified files:
1. `packages/core/src/repositories/knowledge.repository.ts` — add `getByDomain`
2. `packages/core/src/infrastructure/firestore-knowledge.repository.ts` — implement `getByDomain`
3. `packages/core/src/repositories/in-memory-knowledge.repository.ts` — implement `getByDomain`
4. `packages/api/src/app.ts` — add deps + document routes
5. `packages/api/src/index.ts` — instantiate text LLM client, pass to app
6. `packages/api/src/middleware/error-handler.ts` — add `DocumentGenerationError` handling (if needed)

## Content Language Detection

The domain schema has `ingestion.primaryLanguage` which tells us the expected language. The Chapter Writer prompt instructs the LLM to match the language of the knowledge entries. For `_meta.json`, we use `ingestion.primaryLanguage` from the domain config.

## Out of Scope

- Cloud Storage (Firestore only for MVP)
- PDF generation
- Version history
- Session-end trigger
- Frontend
- Changes to conversation pipeline
