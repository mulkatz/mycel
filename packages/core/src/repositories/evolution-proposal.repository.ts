import type {
  EvolutionProposal,
  EvolutionProposalStatus,
  EvolutionProposalType,
} from '@mycel/shared/src/types/evolution.types.js';

export interface CreateEvolutionProposalInput {
  readonly domainSchemaId: string;
  readonly type: EvolutionProposalType;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
  readonly newCategory?: EvolutionProposal['newCategory'];
  readonly newField?: EvolutionProposal['newField'];
  readonly changePriority?: EvolutionProposal['changePriority'];
  readonly clusterMetadata?: EvolutionProposal['clusterMetadata'];
}

export interface UpdateEvolutionProposalInput {
  readonly status?: EvolutionProposalStatus;
  readonly appliedAt?: Date;
}

export interface EvolutionProposalRepository {
  create(input: CreateEvolutionProposalInput): Promise<EvolutionProposal>;
  getById(id: string): Promise<EvolutionProposal | null>;
  getPendingByDomain(domainSchemaId: string): Promise<readonly EvolutionProposal[]>;
  getByDomain(domainSchemaId: string): Promise<readonly EvolutionProposal[]>;
  update(id: string, updates: UpdateEvolutionProposalInput): Promise<void>;
}
