import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import type { DocumentGenerator, GeneratedDocument } from '@mycel/core/src/services/document-generator/types.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    { id: 'history', label: 'History & Heritage', description: 'Historical events' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

const mockDocument: GeneratedDocument = {
  meta: {
    generatedAt: '2025-02-12T15:30:00Z',
    domainSchemaId: 'test-domain',
    contentLanguage: 'de',
    totalEntries: 3,
    totalChapters: 1,
    chaptersWithContent: 1,
    chaptersEmpty: 0,
    gapsIdentified: 1,
    sourceEntryIds: ['e1', 'e2', 'e3'],
    generationDurationMs: 5000,
  },
  chapters: [
    {
      filename: '01-history.md',
      title: 'History & Heritage',
      content: '# History & Heritage\n\nThe old church was built in 1732.\n',
      entryCount: 3,
      gapCount: 1,
      gaps: [{ field: 'sources', description: 'Required field "sources" is missing.' }],
    },
  ],
  indexContent: '# test-domain\n\nTest domain\n\n## Table of Contents\n\n- [History & Heritage](./01-history.md) (3 entries)\n',
};

describe('Document Routes', () => {
  let app: Hono<AppEnv>;
  let schemaRepo: SchemaRepository;
  let mockGenerator: DocumentGenerator;

  beforeEach(async () => {
    schemaRepo = createInMemorySchemaRepository();
    await schemaRepo.saveDomainSchema({
      name: 'test-domain',
      version: 1,
      config: domainConfig,
      isActive: true,
    });

    mockGenerator = {
      generate: vi.fn().mockResolvedValue(mockDocument),
      getLatest: vi.fn().mockResolvedValue(mockDocument),
    };

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: createInMemoryKnowledgeRepository(),
      schemaRepository: schemaRepo,
      documentGenerator: mockGenerator,
    } as TenantRepositories;

    const sharedDeps = { llmClient: { invoke: vi.fn() } } as unknown as SharedDeps;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('POST /domains/:domainSchemaId/documents/generate', () => {
    it('should generate a document and return meta + chapters', async () => {
      const res = await app.request('/domains/test-domain/documents/generate', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'completed');
      expect(body).toHaveProperty('meta');
      expect(body).toHaveProperty('chapters');

      const meta = body['meta'] as Record<string, unknown>;
      expect(meta['domainSchemaId']).toBe('test-domain');
      expect(meta['totalEntries']).toBe(3);

      const chapters = body['chapters'] as Array<Record<string, unknown>>;
      expect(chapters).toHaveLength(1);
      expect(chapters[0]['filename']).toBe('01-history.md');
      expect(chapters[0]['entryCount']).toBe(3);
      // Content should NOT be in the response summary
      expect(chapters[0]).not.toHaveProperty('content');
    });

    it('should return 404 for unknown domain schema', async () => {
      const res = await app.request('/domains/nonexistent/documents/generate', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SCHEMA_NOT_FOUND');
    });
  });

  describe('GET /domains/:domainSchemaId/documents/latest', () => {
    it('should return index.md as markdown', async () => {
      const res = await app.request('/domains/test-domain/documents/latest');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/markdown');
      const body = await res.text();
      expect(body).toContain('# test-domain');
      expect(body).toContain('Table of Contents');
    });

    it('should return 404 when no document exists', async () => {
      vi.mocked(mockGenerator.getLatest).mockResolvedValue(null);

      const res = await app.request('/domains/test-domain/documents/latest');

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'DOCUMENT_NOT_FOUND');
    });
  });

  describe('GET /domains/:domainSchemaId/documents/latest/meta', () => {
    it('should return meta as JSON', async () => {
      const res = await app.request('/domains/test-domain/documents/latest/meta');

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body['domainSchemaId']).toBe('test-domain');
      expect(body['totalEntries']).toBe(3);
    });
  });

  describe('GET /domains/:domainSchemaId/documents/latest/:filename', () => {
    it('should return chapter content as markdown', async () => {
      const res = await app.request('/domains/test-domain/documents/latest/01-history.md');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/markdown');
      const body = await res.text();
      expect(body).toContain('# History & Heritage');
      expect(body).toContain('1732');
    });

    it('should return 404 for unknown chapter', async () => {
      const res = await app.request('/domains/test-domain/documents/latest/99-unknown.md');

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'CHAPTER_NOT_FOUND');
    });
  });
});
