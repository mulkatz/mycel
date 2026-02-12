import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInMemoryKnowledgeRepository } from '../../repositories/in-memory-knowledge.repository.js';
import { createInMemorySearchCacheRepository } from '../../repositories/in-memory-search-cache.repository.js';
import { createMockWebSearchClient } from '../web-search/mock-web-search-client.js';
import { createEnrichmentOrchestrator } from './enrichment-orchestrator.js';
import type { LlmClient } from '../../llm/llm-client.js';
import type { EnrichmentConfig } from './types.js';

function createTestConfig(
  overrides?: Partial<EnrichmentConfig>,
): EnrichmentConfig {
  return {
    maxSearchesPerTurn: 3,
    domainSchemaId: 'test-domain',
    webSearchMode: 'enrichment',
    validationMode: 'flag_conflicts',
    ...overrides,
  };
}

describe('EnrichmentOrchestrator', () => {
  let knowledgeRepo: ReturnType<typeof createInMemoryKnowledgeRepository>;
  let searchCacheRepo: ReturnType<typeof createInMemorySearchCacheRepository>;
  let llmCallCount: number;
  let llmClient: LlmClient;

  beforeEach(() => {
    knowledgeRepo = createInMemoryKnowledgeRepository();
    searchCacheRepo = createInMemorySearchCacheRepository();
    llmCallCount = 0;

    llmClient = {
      invoke: vi.fn().mockImplementation(() => {
        llmCallCount++;
        if (llmCallCount === 1) {
          // Claim extraction response
          return Promise.resolve({
            content: JSON.stringify({
              claims: [
                {
                  claim: 'The church was built in 1732',
                  verifiable: true,
                  searchQuery: 'church built 1732',
                },
              ],
            }),
          });
        }
        // Claim validation response
        return Promise.resolve({
          content: JSON.stringify({
            status: 'verified',
            evidence: 'Records confirm the church was built in 1732',
            confidence: 0.9,
          }),
        });
      }),
    };
  });

  async function createTestEntry(): Promise<string> {
    const entry = await knowledgeRepo.create({
      sessionId: 'session-1',
      turnId: 'turn-1',
      categoryId: 'history',
      confidence: 0.85,
      topicKeywords: ['church', 'history'],
      rawInput: 'The church was built in 1732',
      domainSchemaId: 'test-domain',
      title: 'Church History',
      content: 'The church was built in 1732',
      source: { type: 'text' },
      structuredData: {},
      tags: ['church'],
      metadata: {},
    });
    return entry.id;
  }

  it('should extract and verify claims', async () => {
    const entryId = await createTestEntry();
    const webSearchClient = createMockWebSearchClient();
    const orchestrator = createEnrichmentOrchestrator(
      {
        llmClient,
        webSearchClient,
        knowledgeRepository: knowledgeRepo,
        searchCacheRepository: searchCacheRepo,
      },
      createTestConfig(),
    );

    await orchestrator.enrichAsync({
      userInput: 'The church was built in 1732',
      entryId,
      categoryId: 'history',
      domainSchemaId: 'test-domain',
    });

    const entry = await knowledgeRepo.getById(entryId);
    expect(entry?.enrichment).toBeDefined();
    expect(entry?.enrichment?.claims).toHaveLength(1);
    expect(entry?.enrichment?.claims[0].status).toBe('verified');
    expect(entry?.enrichment?.enrichedAt).toBeInstanceOf(Date);
  });

  it('should skip enrichment when no verifiable claims', async () => {
    const entryId = await createTestEntry();
    const noClaimsLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({ claims: [] }),
      }),
    };

    const orchestrator = createEnrichmentOrchestrator(
      {
        llmClient: noClaimsLlm,
        webSearchClient: createMockWebSearchClient(),
        knowledgeRepository: knowledgeRepo,
        searchCacheRepository: searchCacheRepo,
      },
      createTestConfig(),
    );

    await orchestrator.enrichAsync({
      userInput: 'I feel happy about the village',
      entryId,
      categoryId: 'history',
      domainSchemaId: 'test-domain',
    });

    const entry = await knowledgeRepo.getById(entryId);
    expect(entry?.enrichment).toBeUndefined();
  });

  it('should use search cache on second call with same query', async () => {
    const entryId = await createTestEntry();
    const webSearchClient = createMockWebSearchClient();
    const searchSpy = vi.spyOn(webSearchClient, 'search');

    const orchestrator = createEnrichmentOrchestrator(
      {
        llmClient,
        webSearchClient,
        knowledgeRepository: knowledgeRepo,
        searchCacheRepository: searchCacheRepo,
      },
      createTestConfig(),
    );

    // First call
    await orchestrator.enrichAsync({
      userInput: 'The church was built in 1732',
      entryId,
      categoryId: 'history',
      domainSchemaId: 'test-domain',
    });

    // Reset for second call
    llmCallCount = 0;
    const entryId2 = await createTestEntry();

    // Second call with same claim
    await orchestrator.enrichAsync({
      userInput: 'The church was built in 1732',
      entryId: entryId2,
      categoryId: 'history',
      domainSchemaId: 'test-domain',
    });

    // Web search should only be called once (cache hit on second call)
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });
});
