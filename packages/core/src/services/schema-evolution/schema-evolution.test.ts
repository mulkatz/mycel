import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';
import type { PersistedDomainSchema } from '../../repositories/schema.repository.js';
import { createInMemoryKnowledgeRepository } from '../../repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '../../repositories/in-memory-schema.repository.js';
import { createInMemoryEvolutionProposalRepository } from '../../repositories/in-memory-evolution-proposal.repository.js';
import { createInMemoryFieldStatsRepository } from '../../repositories/in-memory-field-stats.repository.js';
import { createSchemaEvolutionService } from './schema-evolution.js';
import type { LlmClient } from '../../llm/llm-client.js';

const testDomainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain for evolution',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical knowledge',
      requiredFields: ['period', 'location'],
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

const fixedBehavior: DomainBehaviorConfig = {
  ...suggestBehavior,
  schemaEvolution: 'fixed',
};

function createMockLlmClient(): LlmClient {
  return {
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        categoryId: 'traditions',
        label: 'Local Traditions',
        description: 'Traditional customs and celebrations',
        suggestedFields: ['name', 'season'],
      }),
    }),
  };
}

describe('SchemaEvolutionService', () => {
  let knowledgeRepo: ReturnType<typeof createInMemoryKnowledgeRepository>;
  let schemaRepo: ReturnType<typeof createInMemorySchemaRepository>;
  let proposalRepo: ReturnType<typeof createInMemoryEvolutionProposalRepository>;
  let fieldStatsRepo: ReturnType<typeof createInMemoryFieldStatsRepository>;

  beforeEach(() => {
    knowledgeRepo = createInMemoryKnowledgeRepository();
    schemaRepo = createInMemorySchemaRepository();
    proposalRepo = createInMemoryEvolutionProposalRepository();
    fieldStatsRepo = createInMemoryFieldStatsRepository();
  });

  async function setupSchema(behavior: DomainBehaviorConfig): Promise<PersistedDomainSchema> {
    return schemaRepo.saveDomainSchema({
      name: 'test-domain',
      version: 1,
      config: testDomainConfig,
      behavior,
      origin: 'manual',
      isActive: true,
    });
  }

  it('should return empty proposals for fixed mode', async () => {
    const schema = await setupSchema(fixedBehavior);
    const invokeMock = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        categoryId: 'traditions',
        label: 'Local Traditions',
        description: 'Traditional customs',
        suggestedFields: ['name'],
      }),
    });
    const llmClient: LlmClient = { invoke: invokeMock };
    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient,
    });

    const proposals = await service.analyze(schema.id);
    expect(proposals).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('should throw for nonexistent domain', async () => {
    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient: createMockLlmClient(),
    });

    await expect(service.analyze('nonexistent')).rejects.toThrow('Domain schema not found');
  });

  it('should generate change_priority proposals for low answer rate fields', async () => {
    const schema = await setupSchema(suggestBehavior);

    // Simulate low answer rate — use schema.id as domainSchemaId
    for (let i = 0; i < 12; i++) {
      await fieldStatsRepo.incrementAsked(schema.id, 'history', 'location');
    }
    await fieldStatsRepo.incrementAnswered(schema.id, 'history', 'location');

    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient: createMockLlmClient(),
    });

    const proposals = await service.analyze(schema.id);
    const priorityProposals = proposals.filter((p) => p.type === 'change_priority');
    expect(priorityProposals).toHaveLength(1);
    expect(priorityProposals[0].changePriority?.fieldName).toBe('location');
    expect(priorityProposals[0].changePriority?.answerRate).toBeLessThan(0.1);
  });

  it('should review and approve a proposal', async () => {
    const schema = await setupSchema(suggestBehavior);

    const proposal = await proposalRepo.create({
      domainSchemaId: schema.id,
      type: 'change_priority',
      description: 'Test priority change',
      evidence: [],
      confidence: 0.9,
      changePriority: {
        targetCategoryId: 'history',
        fieldName: 'location',
        answerRate: 0.05,
        reasoning: 'Low answer rate',
      },
    });

    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient: createMockLlmClient(),
    });

    const result = await service.reviewProposal(proposal.id, { decision: 'approve' });
    expect(result.status).toBe('approved');
    expect(result.domainSchemaId).toBeDefined();

    // Verify the schema was updated
    const updated = await schemaRepo.getDomainSchemaByName('test-domain');
    const historyCat = updated?.config.categories.find((c) => c.id === 'history');
    expect(historyCat?.requiredFields).not.toContain('location');
    expect(historyCat?.optionalFields).toContain('location');
  });

  it('should reject a proposal', async () => {
    const schema = await setupSchema(suggestBehavior);

    const proposal = await proposalRepo.create({
      domainSchemaId: schema.id,
      type: 'new_category',
      description: 'Test category',
      evidence: [],
      confidence: 0.5,
      newCategory: {
        id: 'test',
        label: 'Test',
        description: 'Test category',
        suggestedFields: [],
      },
    });

    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient: createMockLlmClient(),
    });

    const result = await service.reviewProposal(proposal.id, {
      decision: 'reject',
      feedback: 'Not relevant',
    });
    expect(result.status).toBe('rejected');
  });

  it('should list proposals by domain', async () => {
    const schemaId = 'some-schema-id';
    await proposalRepo.create({
      domainSchemaId: schemaId,
      type: 'new_category',
      description: 'Test',
      evidence: [],
      confidence: 0.5,
    });

    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient: createMockLlmClient(),
    });

    const proposals = await service.getProposals(schemaId);
    expect(proposals).toHaveLength(1);
  });

  it('should return field stats', async () => {
    const schemaId = 'some-schema-id';
    await fieldStatsRepo.incrementAsked(schemaId, 'history', 'period');
    await fieldStatsRepo.incrementAnswered(schemaId, 'history', 'period');

    const service = createSchemaEvolutionService({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      proposalRepository: proposalRepo,
      fieldStatsRepository: fieldStatsRepo,
      llmClient: createMockLlmClient(),
    });

    const stats = await service.getFieldStats(schemaId);
    expect(stats).toHaveLength(1);
    expect(stats[0].answerRate).toBe(1);
  });
});
