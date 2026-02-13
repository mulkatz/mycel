import { describe, it, expect, beforeEach } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import type { KnowledgeRepository } from '@mycel/core/src/repositories/knowledge.repository.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical events',
      requiredFields: ['period', 'sources'],
    },
    { id: 'nature', label: 'Nature', description: 'Natural environment' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
  completeness: {
    autoCompleteThreshold: 0.8,
    maxTurns: 3,
  },
};

const sharedDeps = {} as SharedDeps;

describe('Domain Admin Routes', () => {
  let app: OpenAPIHono<AppEnv>;
  let schemaRepo: SchemaRepository;
  let knowledgeRepo: KnowledgeRepository;

  beforeEach(() => {
    schemaRepo = createInMemorySchemaRepository();
    knowledgeRepo = createInMemoryKnowledgeRepository();

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
    } as TenantRepositories;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('GET /domains', () => {
    it('should return empty array when no domains exist', async () => {
      const res = await app.request('/domains');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ domains: [] });
    });

    it('should return all domain schemas', async () => {
      await schemaRepo.saveDomainSchema({
        name: 'domain-one',
        version: 1,
        config: domainConfig,
        isActive: true,
      });
      await schemaRepo.saveDomainSchema({
        name: 'domain-two',
        version: 1,
        config: { ...domainConfig, name: 'domain-two' },
        isActive: false,
      });

      const res = await app.request('/domains');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { domains: Record<string, unknown>[] };
      expect(body.domains).toHaveLength(2);
      expect(body.domains[0]).toHaveProperty('domainSchemaId');
      expect(body.domains[0]).toHaveProperty('name');
      expect(body.domains[0]).toHaveProperty('categoryCount', 2);
    });

    it('should filter by active status', async () => {
      await schemaRepo.saveDomainSchema({
        name: 'active-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });
      await schemaRepo.saveDomainSchema({
        name: 'inactive-domain',
        version: 1,
        config: { ...domainConfig, name: 'inactive-domain' },
        isActive: false,
      });

      const res = await app.request('/domains?active=true');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { domains: Record<string, unknown>[] };
      expect(body.domains).toHaveLength(1);
      expect(body.domains[0]).toHaveProperty('name', 'active-domain');
      expect(body.domains[0]).toHaveProperty('isActive', true);
    });
  });

  describe('GET /domains/{domainSchemaId}', () => {
    it('should return full domain schema details', async () => {
      const saved = await schemaRepo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });

      const res = await app.request(`/domains/${saved.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('domainSchemaId', saved.id);
      expect(body).toHaveProperty('name', 'test-domain');
      expect(body).toHaveProperty('config');
      expect(body).toHaveProperty('behavior');
    });

    it('should return 404 for non-existent domain', async () => {
      const res = await app.request('/domains/non-existent-id');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'DOMAIN_NOT_FOUND');
    });
  });

  describe('GET /domains/{domainSchemaId}/entries', () => {
    it('should return entries for a domain', async () => {
      const domain = await schemaRepo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });

      await knowledgeRepo.create({
        sessionId: 'session-1',
        turnId: 'turn-1',
        categoryId: 'history',
        confidence: 0.9,
        topicKeywords: ['test'],
        rawInput: 'test input',
        domainSchemaId: domain.id,
        title: 'Test Entry',
        content: 'Test content',
        source: 'text' as never,
        structuredData: {},
        tags: ['tag1'],
        metadata: {},
      });

      const res = await app.request(`/domains/${domain.id}/entries`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entries: Record<string, unknown>[]; total: number };
      expect(body.entries).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.entries[0]).toHaveProperty('title', 'Test Entry');
      expect(body.entries[0]).toHaveProperty('category', 'history');
      expect(body.entries[0]).toHaveProperty('hasEnrichment', false);
    });

    it('should filter entries by category', async () => {
      const domain = await schemaRepo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });

      const baseEntry = {
        sessionId: 'session-1',
        turnId: 'turn-1',
        confidence: 0.9,
        topicKeywords: ['test'],
        rawInput: 'test input',
        domainSchemaId: domain.id,
        content: 'Test content',
        source: 'text' as never,
        structuredData: {},
        tags: [],
        metadata: {},
      };

      await knowledgeRepo.create({ ...baseEntry, categoryId: 'history', title: 'History Entry' });
      await knowledgeRepo.create({ ...baseEntry, categoryId: 'nature', title: 'Nature Entry' });

      const res = await app.request(`/domains/${domain.id}/entries?category=history`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entries: Record<string, unknown>[]; total: number };
      expect(body.entries).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.entries[0]).toHaveProperty('category', 'history');
    });

    it('should paginate entries', async () => {
      const domain = await schemaRepo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });

      const baseEntry = {
        sessionId: 'session-1',
        turnId: 'turn-1',
        categoryId: 'history',
        confidence: 0.9,
        topicKeywords: ['test'],
        rawInput: 'test input',
        domainSchemaId: domain.id,
        content: 'Test content',
        source: 'text' as never,
        structuredData: {},
        tags: [],
        metadata: {},
      };

      for (let i = 0; i < 5; i++) {
        await knowledgeRepo.create({ ...baseEntry, title: `Entry ${String(i)}` });
      }

      const res = await app.request(`/domains/${domain.id}/entries?limit=2&offset=1`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entries: Record<string, unknown>[]; total: number };
      expect(body.entries).toHaveLength(2);
      expect(body.total).toBe(5);
    });

    it('should return 404 for non-existent domain', async () => {
      const res = await app.request('/domains/non-existent-id/entries');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'DOMAIN_NOT_FOUND');
    });
  });

  describe('GET /domains/{domainSchemaId}/entries/{entryId}', () => {
    it('should return full entry details', async () => {
      const domain = await schemaRepo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });

      const entry = await knowledgeRepo.create({
        sessionId: 'session-1',
        turnId: 'turn-1',
        categoryId: 'history',
        confidence: 0.85,
        topicKeywords: ['medieval'],
        rawInput: 'The village was founded in 1200',
        domainSchemaId: domain.id,
        title: 'Village Founding',
        content: 'The village was founded in 1200 by settlers.',
        source: 'text' as never,
        structuredData: { period: '1200' },
        tags: ['medieval', 'founding'],
        metadata: {},
      });

      const res = await app.request(`/domains/${domain.id}/entries/${entry.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('entryId', entry.id);
      expect(body).toHaveProperty('title', 'Village Founding');
      expect(body).toHaveProperty('content', 'The village was founded in 1200 by settlers.');
      expect(body).toHaveProperty('structuredData');
      expect(body).toHaveProperty('tags');
    });

    it('should return 404 for non-existent entry', async () => {
      const domain = await schemaRepo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: domainConfig,
        isActive: true,
      });

      const res = await app.request(`/domains/${domain.id}/entries/non-existent-id`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'ENTRY_NOT_FOUND');
    });

    it('should return 404 when entry belongs to a different domain', async () => {
      const domainA = await schemaRepo.saveDomainSchema({
        name: 'domain-a',
        version: 1,
        config: domainConfig,
        isActive: true,
      });
      const domainB = await schemaRepo.saveDomainSchema({
        name: 'domain-b',
        version: 1,
        config: { ...domainConfig, name: 'domain-b' },
        isActive: false,
      });

      const entry = await knowledgeRepo.create({
        sessionId: 'session-1',
        turnId: 'turn-1',
        categoryId: 'history',
        confidence: 0.9,
        topicKeywords: ['test'],
        rawInput: 'test input',
        domainSchemaId: domainA.id,
        title: 'Entry in Domain A',
        content: 'Content',
        source: 'text' as never,
        structuredData: {},
        tags: [],
        metadata: {},
      });

      // Access via domain B should fail
      const res = await app.request(`/domains/${domainB.id}/entries/${entry.id}`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'ENTRY_NOT_FOUND');
    });
  });
});
