import { randomUUID } from 'node:crypto';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateSchemaProposalInput,
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

    saveProposal(input: CreateSchemaProposalInput): Promise<SchemaProposal> {
      const now = new Date();
      const proposal: SchemaProposal = {
        id: randomUUID(),
        description: input.description,
        language: input.language,
        status: 'pending',
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
        reviewedAt: input.status ? new Date() : existing.reviewedAt,
      };
      proposals.set(id, updated);
      return Promise.resolve(updated);
    },
  };
}
