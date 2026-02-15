import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { LlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createInMemorySchemaProposalRepository } from '@mycel/core/src/repositories/in-memory-schema-proposal.repository.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createMockWebSearchClient } from '@mycel/core/src/services/web-search/mock-web-search-client.js';
import { createSchemaGenerator } from '@mycel/core/src/services/schema-generator/schema-generator.js';
import type { SchemaGenerator } from '@mycel/core/src/services/schema-generator/types.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';

const analysisResponse = {
  domainType: 'local community',
  subject: 'Village Test',
  language: 'de',
  intent: 'build knowledge base',
  searchQueries: ['query1', 'query2', 'query3'],
};

const synthesizedSchema = {
  name: 'test-generated',
  version: '1.0.0',
  description: 'Generated test domain',
  categories: [
    {
      id: 'general',
      label: 'General',
      description: 'General knowledge',
      origin: 'web_research',
      sourceUrls: ['https://example.com'],
    },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

function createMockLlm(): LlmClient {
  let callCount = 0;
  return {
    invoke: vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ content: JSON.stringify(analysisResponse) });
      }
      return Promise.resolve({ content: JSON.stringify(synthesizedSchema) });
    }),
  };
}

function jsonPost(path: string, body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Flush microtask queue to let fire-and-forget promises settle */
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Schema Generator API Routes', () => {
  let app: OpenAPIHono<AppEnv>;
  let schemaGenerator: SchemaGenerator;

  beforeEach(() => {
    const llmClient = createMockLlm();
    const webSearchClient = createMockWebSearchClient();
    const proposalRepo = createInMemorySchemaProposalRepository();
    const schemaRepo = createInMemorySchemaRepository();

    schemaGenerator = createSchemaGenerator({
      llmClient,
      webSearchClient,
      proposalRepository: proposalRepo,
      schemaRepository: schemaRepo,
    });

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: createInMemoryKnowledgeRepository(),
      schemaRepository: schemaRepo,
      schemaProposalRepository: proposalRepo,
      schemaGenerator,
    } as TenantRepositories;

    const sharedDeps = { llmClient } as SharedDeps;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('POST /domains/generate', () => {
    it('should return 202 with generating status', async () => {
      const res = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'A village website for Naugarten, Brandenburg',
        }),
      );

      expect(res.status).toBe(202);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('proposalId');
      expect(body).toHaveProperty('status', 'generating');
      expect(body).not.toHaveProperty('domain');
      expect(body).not.toHaveProperty('sources');
    });

    it('should accept language parameter', async () => {
      const res = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'Ein Dorfwissensportal für Naugarten',
          language: 'de',
        }),
      );

      expect(res.status).toBe(202);
    });

    it('should accept config preset', async () => {
      const res = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'A village website for Naugarten, Brandenburg',
          config: 'full_auto',
        }),
      );

      expect(res.status).toBe(202);
    });

    it('should return 400 for description too short', async () => {
      const res = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'short',
        }),
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 for missing description', async () => {
      const res = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {}),
      );

      expect(res.status).toBe(400);
    });

    it('should return 400 for full config with schemaCreation manual', async () => {
      const res = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'A village website for Naugarten, Brandenburg',
          config: {
            schemaCreation: 'manual',
            schemaEvolution: 'fixed',
            webSearch: 'disabled',
            knowledgeValidation: 'trust_user',
            proactiveQuestioning: 'gentle',
            documentGeneration: 'manual',
          },
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe('POST /domains/proposals/:proposalId/review', () => {
    it('should approve a proposal after generation completes', async () => {
      // Generate
      const genRes = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'A village website for Naugarten, Brandenburg',
        }),
      );
      const genBody = (await genRes.json()) as { proposalId: string };

      // Wait for background generation to complete
      await flushPromises();

      // Then approve
      const reviewRes = await app.request(
        `/domains/proposals/${genBody.proposalId}/review`,
        jsonPost(`/domains/proposals/${genBody.proposalId}/review`, {
          decision: 'approve',
        }),
      );

      expect(reviewRes.status).toBe(200);
      const body = (await reviewRes.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'approved');
      expect(body).toHaveProperty('domainSchemaId');
    });

    it('should reject a proposal with feedback', async () => {
      const genRes = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'A village website for Naugarten, Brandenburg',
        }),
      );
      const genBody = (await genRes.json()) as { proposalId: string };

      await flushPromises();

      const reviewRes = await app.request(
        `/domains/proposals/${genBody.proposalId}/review`,
        jsonPost(`/domains/proposals/${genBody.proposalId}/review`, {
          decision: 'reject',
          feedback: 'Not enough categories',
        }),
      );

      expect(reviewRes.status).toBe(200);
      const body = (await reviewRes.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('status', 'rejected');
    });

    it('should reject reviewing a generating proposal', async () => {
      // Use schemaGenerator directly to create a generating stub without triggering executeGeneration
      const result = await schemaGenerator.generate({
        description: 'A village website for Naugarten, Brandenburg',
      });

      // Proposal is in 'generating' status — try to review it via API
      const reviewRes = await app.request(
        `/domains/proposals/${result.proposalId}/review`,
        jsonPost(`/domains/proposals/${result.proposalId}/review`, {
          decision: 'approve',
        }),
      );

      expect(reviewRes.status).toBe(400);
    });

    it('should return 400 for invalid decision', async () => {
      const res = await app.request(
        '/domains/proposals/some-id/review',
        jsonPost('/domains/proposals/some-id/review', {
          decision: 'invalid',
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /domains/proposals/:proposalId', () => {
    it('should return generating proposal with minimal data', async () => {
      // Use schemaGenerator directly to create a stub without triggering executeGeneration
      const result = await schemaGenerator.generate({
        description: 'A village website for Naugarten, Brandenburg',
      });

      const res = await app.request(`/domains/proposals/${result.proposalId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('id', result.proposalId);
      expect(body).toHaveProperty('status', 'generating');
      expect(body).not.toHaveProperty('domain');
      expect(body).not.toHaveProperty('behavior');
      expect(body).not.toHaveProperty('reasoning');
      expect(body).not.toHaveProperty('sources');
    });

    it('should return completed proposal with full data after generation', async () => {
      const genRes = await app.request(
        '/domains/generate',
        jsonPost('/domains/generate', {
          description: 'A village website for Naugarten, Brandenburg',
        }),
      );
      const genBody = (await genRes.json()) as { proposalId: string };

      await flushPromises();

      const res = await app.request(`/domains/proposals/${genBody.proposalId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('id', genBody.proposalId);
      expect(body).toHaveProperty('status', 'pending');
      expect(body).toHaveProperty('domain');
      expect(body).toHaveProperty('behavior');
      expect(body).toHaveProperty('reasoning');
      expect(body).toHaveProperty('sources');
    });

    it('should return 404 for nonexistent proposal', async () => {
      const res = await app.request('/domains/proposals/nonexistent');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'PROPOSAL_NOT_FOUND');
    });
  });

  describe('executeGeneration failure handling', () => {
    it('should set proposal to failed when generation errors', async () => {
      const failingLlm: LlmClient = {
        invoke: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
      };
      const failingGenerator = createSchemaGenerator({
        llmClient: failingLlm,
        webSearchClient: createMockWebSearchClient(),
        proposalRepository: createInMemorySchemaProposalRepository(),
        schemaRepository: createInMemorySchemaRepository(),
      });

      const failResult = await failingGenerator.generate({ description: 'Test failing generation' });
      await failingGenerator.executeGeneration(failResult.proposalId, { description: 'Test failing generation' });

      const proposal = await failingGenerator.getProposal(failResult.proposalId);
      expect(proposal?.status).toBe('failed');
      expect(proposal?.failureReason).toBeDefined();
    });
  });
});
