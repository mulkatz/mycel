import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';

export type ProposalStatus = 'generating' | 'pending' | 'approved' | 'rejected' | 'failed';

export interface SchemaProposal {
  readonly id: string;
  readonly description: string;
  readonly language: string;
  readonly status: ProposalStatus;
  readonly proposedSchema: DomainConfig;
  readonly behavior: DomainBehaviorConfig;
  readonly reasoning: string;
  readonly sources: readonly string[];
  readonly feedback?: string;
  readonly resultingDomainSchemaId?: string;
  readonly failureReason?: string;
  readonly failedAt?: Date;
  readonly createdAt: Date;
  readonly reviewedAt?: Date;
}

export interface CreateSchemaProposalInput {
  readonly description: string;
  readonly language: string;
  readonly status?: ProposalStatus;
  readonly proposedSchema: DomainConfig;
  readonly behavior: DomainBehaviorConfig;
  readonly reasoning: string;
  readonly sources: readonly string[];
}

export interface UpdateSchemaProposalInput {
  readonly status?: ProposalStatus;
  readonly feedback?: string;
  readonly resultingDomainSchemaId?: string;
  readonly proposedSchema?: DomainConfig;
  readonly behavior?: DomainBehaviorConfig;
  readonly reasoning?: string;
  readonly sources?: readonly string[];
  readonly failureReason?: string;
  readonly failedAt?: Date;
}

export interface ListProposalsFilter {
  readonly statuses?: readonly ProposalStatus[];
}

export interface SchemaProposalRepository {
  getProposal(id: string): Promise<SchemaProposal | null>;
  listProposals(filter?: ListProposalsFilter): Promise<readonly SchemaProposal[]>;
  saveProposal(input: CreateSchemaProposalInput): Promise<SchemaProposal>;
  updateProposal(id: string, input: UpdateSchemaProposalInput): Promise<SchemaProposal>;
}
