import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import { createInMemoryEvolutionProposalRepository } from '@mycel/core/src/repositories/in-memory-evolution-proposal.repository.js';
import { createInMemoryFieldStatsRepository } from '@mycel/core/src/repositories/in-memory-field-stats.repository.js';
import { createSchemaEvolutionService } from '@mycel/core/src/services/schema-evolution/schema-evolution.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { LlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';

const testDomainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical knowledge',
      requiredFields: ['period'],
      optionalFields: ['sources'],
    },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

const suggestBehavior: DomainBehaviorConfig = {
  schemaCreation: 'web_research',
  schemaEvolution: 'suggest',
  webSearch: 'disabled',
  knowledgeValidation: 'trust_user',
  proactiveQuestioning: 'gentle',
  documentGeneration: 'manual',
};

function jsonPost(path: string, body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('Evolution API Routes', () => {
  let app: OpenAPIHono<AppEnv>;
  let proposalRepo: ReturnType<typeof createInMemoryEvolutionProposalRepository>;
  let fieldStatsRepo: ReturnType<typeof createInMemoryFieldStatsRepository>;
  let schemaRepo: ReturnType<typeof createInMemorySchemaRepository>;
  let domainSchemaId: string;

  beforeEach(async () => {
    const llmClient: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'traditions',
          label: 'Traditions',
          description: 'Local traditions',
          suggestedFields: ['name'],
        }),
      }),
    };

    schemaRepo = createInMemorySchemaRepository();
    proposalRepo = createInMemoryEvolutionProposalRepository();
    fieldStatsRepo = createInMemoryFieldStatsRepository();

    const persisted = await schemaRepo.saveDomainSchema({
      name: 'test-domain',
      version: 1,
      config: testDomainConfig,
      behavior: suggestBehavior,
      origin: 'manual',
      isActive: true,
    });
    domainSchemaId = persisted.id;

    const schemaEvolutionService = createSchemaEvolutionService({
      knowledgeRepository: createInMemoryKnowledgeRepository(),
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient,
    });

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: createInMemoryKnowledgeRepository(),
      schemaRepository: schemaRepo,
      evolutionProposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      schemaEvolutionService,
    } as TenantRepositories;

    const sharedDeps = { llmClient } as SharedDeps;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('POST /domains/:domainSchemaId/evolution/analyze', () => {
    it('should trigger analysis and return proposals', async () => {
      const res = await app.request(
        `/domains/${domainSchemaId}/evolution/analyze`,
        { method: 'POST' },
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('domainSchemaId', domainSchemaId);
      expect(body).toHaveProperty('proposalCount');
    });
  });

  describe('GET /domains/:domainSchemaId/evolution/proposals', () => {
    it('should list proposals', async () => {
      await proposalRepo.create({
        domainSchemaId,
        type: 'new_category',
        description: 'Test proposal',
        evidence: [],
        confidence: 0.8,
      });

      const res = await app.request(`/domains/${domainSchemaId}/evolution/proposals`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { proposals: unknown[] };
      expect(body.proposals).toHaveLength(1);
    });
  });

  describe('GET /domains/:domainSchemaId/evolution/proposals/:proposalId', () => {
    it('should return a specific proposal', async () => {
      const proposal = await proposalRepo.create({
        domainSchemaId,
        type: 'new_category',
        description: 'Test proposal',
        evidence: [],
        confidence: 0.8,
        newCategory: {
          id: 'test',
          label: 'Test',
          description: 'Test category',
          suggestedFields: [],
        },
      });

      const res = await app.request(
        `/domains/${domainSchemaId}/evolution/proposals/${proposal.id}`,
      );
      expect(res.status).toBe(200);
    });

    it('should return 404 for nonexistent proposal', async () => {
      const res = await app.request(
        `/domains/${domainSchemaId}/evolution/proposals/nonexistent`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /domains/:domainSchemaId/evolution/proposals/:proposalId/review', () => {
    it('should approve a proposal', async () => {
      const proposal = await proposalRepo.create({
        domainSchemaId,
        type: 'change_priority',
        description: 'Test',
        evidence: [],
        confidence: 0.9,
        changePriority: {
          targetCategoryId: 'history',
          fieldName: 'period',
          answerRate: 0.05,
          reasoning: 'Low answer rate',
        },
      });

      const res = await app.request(
        `/domains/${domainSchemaId}/evolution/proposals/${proposal.id}/review`,
        jsonPost(`/domains/${domainSchemaId}/evolution/proposals/${proposal.id}/review`, {
          decision: 'approve',
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'approved');
    });

    it('should reject a proposal', async () => {
      const proposal = await proposalRepo.create({
        domainSchemaId,
        type: 'new_category',
        description: 'Test',
        evidence: [],
        confidence: 0.5,
      });

      const res = await app.request(
        `/domains/${domainSchemaId}/evolution/proposals/${proposal.id}/review`,
        jsonPost(`/domains/${domainSchemaId}/evolution/proposals/${proposal.id}/review`, {
          decision: 'reject',
          feedback: 'Not relevant',
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'rejected');
    });
  });

  describe('GET /domains/:domainSchemaId/evolution/stats', () => {
    it('should return field stats', async () => {
      await fieldStatsRepo.incrementAsked(domainSchemaId, 'history', 'period');
      await fieldStatsRepo.incrementAnswered(domainSchemaId, 'history', 'period');

      const res = await app.request(`/domains/${domainSchemaId}/evolution/stats`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { stats: unknown[] };
      expect(body.stats).toHaveLength(1);
    });
  });
});
