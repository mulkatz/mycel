import { randomUUID } from 'node:crypto';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateSchemaProposalInput,
  ListProposalsFilter,
  SchemaProposal,
  SchemaProposalRepository,
  UpdateSchemaProposalInput,
} from './schema-proposal.repository.js';

export function createInMemorySchemaProposalRepository(): SchemaProposalRepository {
  const proposals = new Map<string, SchemaProposal>();

  return {
    getProposal(id: string): Promise<SchemaProposal | null> {
      return Promise.resolve(proposals.get(id) ?? null);
    },

    listProposals(filter?: ListProposalsFilter): Promise<readonly SchemaProposal[]> {
      let result = [...proposals.values()];

      if (filter?.statuses && filter.statuses.length > 0) {
        const allowed = new Set(filter.statuses);
        result = result.filter((p) => allowed.has(p.status));
      }

      result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return Promise.resolve(result);
    },

    saveProposal(input: CreateSchemaProposalInput): Promise<SchemaProposal> {
      const now = new Date();
      const proposal: SchemaProposal = {
        id: randomUUID(),
        description: input.description,
        language: input.language,
        status: input.status ?? 'pending',
        proposedSchema: input.proposedSchema,
        behavior: input.behavior,
        reasoning: input.reasoning,
        sources: input.sources,
        createdAt: now,
      };
      proposals.set(proposal.id, proposal);
      return Promise.resolve(proposal);
    },

    updateProposal(id: string, input: UpdateSchemaProposalInput): Promise<SchemaProposal> {
      const existing = proposals.get(id);
      if (!existing) {
        return Promise.reject(new PersistenceError(`Schema proposal not found: ${id}`));
      }

      const updated: SchemaProposal = {
        ...existing,
        status: input.status ?? existing.status,
        feedback: input.feedback ?? existing.feedback,
        resultingDomainSchemaId: input.resultingDomainSchemaId ?? existing.resultingDomainSchemaId,
        proposedSchema: input.proposedSchema ?? existing.proposedSchema,
        behavior: input.behavior ?? existing.behavior,
        reasoning: input.reasoning ?? existing.reasoning,
        sources: input.sources ?? existing.sources,
        failureReason: input.failureReason ?? existing.failureReason,
        failedAt: input.failedAt ?? existing.failedAt,
        reviewedAt: (input.status === 'approved' || input.status === 'rejected') ? new Date() : existing.reviewedAt,
      };
      proposals.set(id, updated);
      return Promise.resolve(updated);
    },
  };
}
