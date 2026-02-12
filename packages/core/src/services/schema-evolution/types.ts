import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { EvolutionProposal, FieldStats } from '@mycel/shared/src/types/evolution.types.js';
import type { KnowledgeRepository } from '../../repositories/knowledge.repository.js';
import type { SchemaRepository } from '../../repositories/schema.repository.js';
import type { EvolutionProposalRepository } from '../../repositories/evolution-proposal.repository.js';
import type { FieldStatsRepository } from '../../repositories/field-stats.repository.js';
import type { LlmClient } from '../../llm/llm-client.js';

export interface SchemaEvolutionDeps {
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly proposalRepository: EvolutionProposalRepository;
  readonly fieldStatsRepository: FieldStatsRepository;
  readonly llmClient: LlmClient;
}

export type EvolutionReviewDecision = 'approve' | 'approve_with_changes' | 'reject';

export interface EvolutionReviewParams {
  readonly decision: EvolutionReviewDecision;
  readonly feedback?: string;
}

export interface EvolutionReviewResult {
  readonly proposalId: string;
  readonly status: 'approved' | 'rejected' | 'auto_applied';
  readonly domainSchemaId?: string;
}

export interface SchemaEvolutionService {
  analyze(domainSchemaId: string): Promise<readonly EvolutionProposal[]>;
  reviewProposal(
    proposalId: string,
    review: EvolutionReviewParams,
  ): Promise<EvolutionReviewResult>;
  getProposals(domainSchemaId: string): Promise<readonly EvolutionProposal[]>;
  getFieldStats(domainSchemaId: string): Promise<readonly FieldStats[]>;
}

export interface ClusterAnalysis {
  readonly entries: readonly KnowledgeEntry[];
  readonly centroidEntryId: string;
  readonly averageSimilarity: number;
  readonly topKeywords: readonly string[];
}
