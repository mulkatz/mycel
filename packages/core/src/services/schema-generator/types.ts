import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { DomainBehaviorConfig, BehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import type { LlmClient } from '../../llm/llm-client.js';
import type { WebSearchClient } from '../web-search/types.js';
import type { SchemaProposalRepository, SchemaProposal, ListProposalsFilter } from '../../repositories/schema-proposal.repository.js';
import type { SchemaRepository } from '../../repositories/schema.repository.js';

export interface SchemaGeneratorDeps {
  readonly llmClient: LlmClient;
  readonly webSearchClient: WebSearchClient;
  readonly proposalRepository: SchemaProposalRepository;
  readonly schemaRepository: SchemaRepository;
}

export interface GenerateSchemaParams {
  readonly description: string;
  readonly language?: string;
  readonly config?: BehaviorPreset | DomainBehaviorConfig;
  readonly partialSchema?: Partial<DomainConfig>;
}

export type ReviewDecision = 'approve' | 'approve_with_changes' | 'reject';

export interface ReviewParams {
  readonly decision: ReviewDecision;
  readonly modifications?: Partial<DomainConfig>;
  readonly feedback?: string;
}

export interface SchemaGenerationResult {
  readonly proposalId: string;
  readonly status: 'generating';
}

export interface ReviewResult {
  readonly proposalId: string;
  readonly status: 'approved' | 'rejected';
  readonly domainSchemaId?: string;
}

export interface SchemaGenerator {
  generate(params: GenerateSchemaParams): Promise<SchemaGenerationResult>;
  executeGeneration(proposalId: string, params: GenerateSchemaParams): Promise<void>;
  reviewProposal(proposalId: string, review: ReviewParams): Promise<ReviewResult>;
  getProposal(proposalId: string): Promise<SchemaProposal | null>;
  listProposals(filter?: ListProposalsFilter): Promise<readonly SchemaProposal[]>;
}

export interface DomainAnalysis {
  readonly domainType: string;
  readonly subject: string;
  readonly location?: string | null;
  readonly language: string;
  readonly intent: string;
  readonly searchQueries: readonly string[];
}
