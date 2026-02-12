import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Hono } from 'hono';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { LlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';

describe('Entry API Routes', () => {
  let app: Hono<AppEnv>;
  let knowledgeRepo: ReturnType<typeof createInMemoryKnowledgeRepository>;

  beforeEach(() => {
    const llmClient: LlmClient = {
      invoke: vi.fn().mockResolvedValue({ content: '{}' }),
    };

    knowledgeRepo = createInMemoryKnowledgeRepository();

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: knowledgeRepo,
      schemaRepository: createInMemorySchemaRepository(),
    } as TenantRepositories;

    const sharedDeps = { llmClient } as SharedDeps;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('GET /entries/:entryId/enrichment', () => {
    it('should return 404 for nonexistent entry', async () => {
      const res = await app.request('/entries/nonexistent/enrichment');

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'ENTRY_NOT_FOUND');
    });

    it('should return not_enriched when entry has no enrichment', async () => {
      const entry = await knowledgeRepo.create({
        sessionId: 'session-1',
        turnId: 'turn-1',
        categoryId: 'history',
        confidence: 0.85,
        topicKeywords: ['church'],
        rawInput: 'The church was built in 1732',
        domainSchemaId: 'test-domain',
        title: 'Church History',
        content: 'The church was built in 1732',
        source: { type: 'text' },
        structuredData: {},
        tags: ['church'],
        metadata: {},
      });

      const res = await app.request(`/entries/${entry.id}/enrichment`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'not_enriched');
      expect(body).toHaveProperty('enrichment', null);
    });

    it('should return enrichment data when entry is enriched', async () => {
      const entry = await knowledgeRepo.create({
        sessionId: 'session-1',
        turnId: 'turn-1',
        categoryId: 'history',
        confidence: 0.85,
        topicKeywords: ['church'],
        rawInput: 'The church was built in 1732',
        domainSchemaId: 'test-domain',
        title: 'Church History',
        content: 'The church was built in 1732',
        source: { type: 'text' },
        structuredData: {},
        tags: ['church'],
        metadata: {},
      });

      await knowledgeRepo.update(entry.id, {
        enrichment: {
          claims: [
            {
              claim: 'The church was built in 1732',
              status: 'verified',
              evidence: 'Records confirm construction in 1732',
              confidence: 0.9,
              sourceUrl: 'https://example.com/church',
            },
          ],
          enrichedAt: new Date('2025-01-01T00:00:00Z'),
          searchQueries: ['church built 1732'],
          sourceUrls: ['https://example.com/church'],
        },
      });

      const res = await app.request(`/entries/${entry.id}/enrichment`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        enrichment: {
          claims: unknown[];
          enrichedAt: string;
          searchQueries: string[];
          sourceUrls: string[];
        };
      };
      expect(body).toHaveProperty('status', 'enriched');
      expect(body.enrichment.claims).toHaveLength(1);
      expect(body.enrichment.enrichedAt).toBe('2025-01-01T00:00:00.000Z');
      expect(body.enrichment.searchQueries).toEqual(['church built 1732']);
    });
  });
});
