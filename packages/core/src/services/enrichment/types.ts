import type { LlmClient } from '../../llm/llm-client.js';
import type { WebSearchClient } from '../web-search/types.js';
import type { KnowledgeRepository } from '../../repositories/knowledge.repository.js';
import type { SearchCacheRepository } from '../../repositories/search-cache.repository.js';
import type { EvolutionProposalRepository } from '../../repositories/evolution-proposal.repository.js';

export interface EnrichmentDeps {
  readonly llmClient: LlmClient;
  readonly webSearchClient: WebSearchClient;
  readonly knowledgeRepository: KnowledgeRepository;
  readonly searchCacheRepository: SearchCacheRepository;
  readonly evolutionProposalRepository?: EvolutionProposalRepository;
}

export interface EnrichmentConfig {
  readonly maxSearchesPerTurn?: number;
  readonly domainSchemaId: string;
  readonly webSearchMode: 'disabled' | 'bootstrap_only' | 'enrichment' | 'full';
  readonly validationMode: 'trust_user' | 'flag_conflicts' | 'verify';
}

export interface EnrichmentOrchestrator {
  enrichAsync(params: {
    userInput: string;
    entryId: string;
    categoryId: string;
    domainSchemaId: string;
  }): Promise<void>;
}
