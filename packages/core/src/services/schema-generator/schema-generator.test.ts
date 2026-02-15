import { describe, it, expect, vi } from 'vitest';
import type { LlmClient } from '../../llm/llm-client.js';
import type { WebSearchClient, WebSearchResult } from '../web-search/types.js';
import { createInMemorySchemaProposalRepository } from '../../repositories/in-memory-schema-proposal.repository.js';
import { createInMemorySchemaRepository } from '../../repositories/in-memory-schema.repository.js';
import { resolveBehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import { createSchemaGenerator } from './schema-generator.js';

const analysisResponse = {
  domainType: 'local community',
  subject: 'Village of Naugarten',
  location: 'Brandenburg',
  language: 'de',
  intent: 'document community knowledge',
  searchQueries: [
    'Naugarten Brandenburg Geschichte',
    'Naugarten Natur Umgebung',
    'Vereine ländlicher Raum Brandenburg',
  ],
};

const synthesizedSchema = {
  name: 'village-naugarten',
  version: '1.0.0',
  description: 'Knowledge base for Naugarten village',
  categories: [
    {
      id: 'history',
      label: 'Geschichte',
      description: 'Historische Ereignisse',
      requiredFields: ['period'],
      origin: 'web_research',
      sourceUrls: ['https://example.com/history'],
    },
    {
      id: 'nature',
      label: 'Natur',
      description: 'Lokale Natur',
      origin: 'web_research',
      sourceUrls: ['https://example.com/nature'],
    },
  ],
  ingestion: {
    allowedModalities: ['text', 'audio', 'image'],
    primaryLanguage: 'de',
    supportedLanguages: ['de', 'en'],
  },
};

function createMockLlm(): LlmClient {
  let callCount = 0;
  return {
    invoke: vi.fn().mockImplementation(() => {
      callCount++;
      // First call: domain analysis. Second call: schema synthesis.
      if (callCount === 1) {
        return Promise.resolve({ content: JSON.stringify(analysisResponse) });
      }
      return Promise.resolve({ content: JSON.stringify(synthesizedSchema) });
    }),
  };
}

function createMockWebSearch(): WebSearchClient {
  return {
    search: vi.fn().mockImplementation((query: string): Promise<WebSearchResult> => {
      return Promise.resolve({
        query,
        content: `Research results for: ${query}`,
        sourceUrls: [`https://example.com/${query.split(' ')[0].toLowerCase()}`],
      });
    }),
  };
}

function createFailingWebSearch(): WebSearchClient {
  return {
    search: vi.fn().mockRejectedValue(new Error('Search API unavailable')),
  };
}

describe('SchemaGenerator', () => {
  it('should generate a schema proposal from a description', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const schemaRepo = createInMemorySchemaRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: schemaRepo,
    });

    const result = await generator.generate({
      description: 'A village website for Naugarten, Brandenburg',
    });

    expect(result.proposalId).toBeDefined();
    expect(result.status).toBe('generating');

    // Verify stub was persisted with generating status
    const stubProposal = await proposalRepo.getProposal(result.proposalId);
    expect(stubProposal).not.toBeNull();
    expect(stubProposal?.status).toBe('generating');

    // Execute the background generation
    await generator.executeGeneration(result.proposalId, {
      description: 'A village website for Naugarten, Brandenburg',
    });

    // Verify proposal was updated with full data
    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal).not.toBeNull();
    expect(proposal?.status).toBe('pending');
    expect(proposal?.proposedSchema.name).toBe('village-naugarten');
    expect(proposal?.proposedSchema.categories.length).toBe(2);
    expect(proposal?.sources.length).toBeGreaterThan(0);
    expect(proposal?.reasoning).toContain('Naugarten');
  });

  it('should tolerate partial search failures', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const schemaRepo = createInMemorySchemaRepository();

    let callCount = 0;
    const partiallyFailingSearch: WebSearchClient = {
      search: vi.fn().mockImplementation((query: string) => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          query,
          content: `Results for ${query}`,
          sourceUrls: ['https://example.com'],
        });
      }),
    };

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: partiallyFailingSearch,
      proposalRepository: proposalRepo,
      schemaRepository: schemaRepo,
    });

    const result = await generator.generate({
      description: 'Test domain',
    });

    await generator.executeGeneration(result.proposalId, {
      description: 'Test domain',
    });

    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal?.status).toBe('pending');
    // Should succeed despite one search failure
    expect(proposal?.reasoning).toContain('2/3');
  });

  it('should set proposal to failed when all searches fail', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createFailingWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const result = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(result.proposalId, { description: 'Test domain' });

    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal?.status).toBe('failed');
    expect(proposal?.failureReason).toContain('All web searches failed');
  });

  it('should use balanced preset by default', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const result = await generator.generate({
      description: 'Test domain',
    });

    await generator.executeGeneration(result.proposalId, {
      description: 'Test domain',
    });

    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal?.behavior).toEqual(resolveBehaviorPreset('balanced'));
  });

  it('should resolve preset name to behavior config', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const result = await generator.generate({
      description: 'Test domain',
      config: 'full_auto',
    });

    await generator.executeGeneration(result.proposalId, {
      description: 'Test domain',
      config: 'full_auto',
    });

    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal?.behavior).toEqual(resolveBehaviorPreset('full_auto'));
  });

  it('should accept a full behavior config object', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const customBehavior = {
      ...resolveBehaviorPreset('balanced'),
      documentGeneration: 'on_session_end' as const,
    };

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const result = await generator.generate({
      description: 'Test domain',
      config: customBehavior,
    });

    await generator.executeGeneration(result.proposalId, {
      description: 'Test domain',
      config: customBehavior,
    });

    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal?.behavior.documentGeneration).toBe('on_session_end');
  });

  it('should set proposal to failed when LLM errors', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const failingLlm: LlmClient = {
      invoke: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };

    const generator = createSchemaGenerator({
      llmClient: failingLlm,
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const result = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(result.proposalId, { description: 'Test domain' });

    const proposal = await proposalRepo.getProposal(result.proposalId);
    expect(proposal?.status).toBe('failed');
    expect(proposal?.failureReason).toBe('LLM unavailable');
    expect(proposal?.failedAt).toBeDefined();
  });
});

describe('SchemaGenerator review flow', () => {
  it('should approve a proposal and create domain schema', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const schemaRepo = createInMemorySchemaRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: schemaRepo,
    });

    const generated = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(generated.proposalId, { description: 'Test domain' });

    const result = await generator.reviewProposal(generated.proposalId, {
      decision: 'approve',
    });

    expect(result.status).toBe('approved');
    expect(result.domainSchemaId).toBeDefined();

    // Verify domain schema was created
    const domainSchemaId = result.domainSchemaId as string;
    const schema = await schemaRepo.getDomainSchema(domainSchemaId);
    expect(schema).not.toBeNull();
    expect(schema?.config.name).toBe('village-naugarten');
    expect(schema?.behavior.webSearch).toBe('bootstrap_only');
    expect(schema?.origin).toBe('web_research');
    expect(schema?.generatedFrom).toBe(generated.proposalId);

    // Verify proposal was updated
    const proposal = await proposalRepo.getProposal(generated.proposalId);
    expect(proposal?.status).toBe('approved');
    expect(proposal?.resultingDomainSchemaId).toBe(result.domainSchemaId);
  });

  it('should approve with changes', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const schemaRepo = createInMemorySchemaRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: schemaRepo,
    });

    const generated = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(generated.proposalId, { description: 'Test domain' });

    const result = await generator.reviewProposal(generated.proposalId, {
      decision: 'approve_with_changes',
      modifications: {
        description: 'Modified description',
      },
    });

    expect(result.status).toBe('approved');

    const schema = await schemaRepo.getDomainSchema(result.domainSchemaId as string);
    expect(schema?.config.description).toBe('Modified description');
    // Categories should be preserved from the original
    expect(schema?.config.categories.length).toBe(2);
  });

  it('should reject a proposal with feedback', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const generated = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(generated.proposalId, { description: 'Test domain' });

    const result = await generator.reviewProposal(generated.proposalId, {
      decision: 'reject',
      feedback: 'Categories too broad',
    });

    expect(result.status).toBe('rejected');
    expect(result.domainSchemaId).toBeUndefined();

    const proposal = await proposalRepo.getProposal(generated.proposalId);
    expect(proposal?.status).toBe('rejected');
    expect(proposal?.feedback).toBe('Categories too broad');
  });

  it('should throw when reviewing nonexistent proposal', async () => {
    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: createInMemorySchemaProposalRepository(),
      schemaRepository: createInMemorySchemaRepository(),
    });

    await expect(
      generator.reviewProposal('nonexistent', { decision: 'approve' }),
    ).rejects.toThrow('Proposal not found');
  });

  it('should throw when reviewing a generating proposal', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const generated = await generator.generate({ description: 'Test domain' });
    // Don't call executeGeneration — proposal is still 'generating'

    await expect(
      generator.reviewProposal(generated.proposalId, { decision: 'approve' }),
    ).rejects.toThrow('still generating');
  });

  it('should throw when reviewing a failed proposal', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();
    const failingLlm: LlmClient = {
      invoke: vi.fn().mockRejectedValue(new Error('LLM error')),
    };

    const generator = createSchemaGenerator({
      llmClient: failingLlm,
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const generated = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(generated.proposalId, { description: 'Test domain' });

    await expect(
      generator.reviewProposal(generated.proposalId, { decision: 'approve' }),
    ).rejects.toThrow('failed and cannot be reviewed');
  });

  it('should throw when reviewing already-reviewed proposal', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const generated = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(generated.proposalId, { description: 'Test domain' });

    await generator.reviewProposal(generated.proposalId, { decision: 'reject' });

    await expect(
      generator.reviewProposal(generated.proposalId, { decision: 'approve' }),
    ).rejects.toThrow('already been reviewed');
  });

  it('should reject approve_with_changes when modifications produce invalid schema', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const generated = await generator.generate({ description: 'Test domain' });
    await generator.executeGeneration(generated.proposalId, { description: 'Test domain' });

    await expect(
      generator.reviewProposal(generated.proposalId, {
        decision: 'approve_with_changes',
        modifications: {
          categories: [], // empty array violates min(1)
        },
      }),
    ).rejects.toThrow('Modified schema is invalid');

    // Proposal should still be pending
    const proposal = await proposalRepo.getProposal(generated.proposalId);
    expect(proposal?.status).toBe('pending');
  });

  it('should retrieve a proposal by ID', async () => {
    const proposalRepo = createInMemorySchemaProposalRepository();

    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: proposalRepo,
      schemaRepository: createInMemorySchemaRepository(),
    });

    const generated = await generator.generate({ description: 'Test domain' });

    const proposal = await generator.getProposal(generated.proposalId);
    expect(proposal).not.toBeNull();
    expect(proposal?.description).toBe('Test domain');
  });

  it('should return null for nonexistent proposal', async () => {
    const generator = createSchemaGenerator({
      llmClient: createMockLlm(),
      webSearchClient: createMockWebSearch(),
      proposalRepository: createInMemorySchemaProposalRepository(),
      schemaRepository: createInMemorySchemaRepository(),
    });

    const proposal = await generator.getProposal('nonexistent');
    expect(proposal).toBeNull();
  });
});
