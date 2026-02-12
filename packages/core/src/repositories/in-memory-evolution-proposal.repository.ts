import { randomUUID } from 'node:crypto';
import type { EvolutionProposal } from '@mycel/shared/src/types/evolution.types.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateEvolutionProposalInput,
  EvolutionProposalRepository,
  UpdateEvolutionProposalInput,
} from './evolution-proposal.repository.js';

export function createInMemoryEvolutionProposalRepository(): EvolutionProposalRepository {
  const proposals = new Map<string, EvolutionProposal>();

  return {
    create(input: CreateEvolutionProposalInput): Promise<EvolutionProposal> {
      const now = new Date();
      const proposal: EvolutionProposal = {
        id: randomUUID(),
        domainSchemaId: input.domainSchemaId,
        type: input.type,
        description: input.description,
        evidence: input.evidence,
        confidence: input.confidence,
        status: 'pending',
        newCategory: input.newCategory,
        newField: input.newField,
        changePriority: input.changePriority,
        clusterMetadata: input.clusterMetadata,
        createdAt: now,
      };
      proposals.set(proposal.id, proposal);
      return Promise.resolve(proposal);
    },

    getById(id: string): Promise<EvolutionProposal | null> {
      return Promise.resolve(proposals.get(id) ?? null);
    },

    getPendingByDomain(domainSchemaId: string): Promise<readonly EvolutionProposal[]> {
      const result = [...proposals.values()].filter(
        (p) => p.domainSchemaId === domainSchemaId && p.status === 'pending',
      );
      return Promise.resolve(result);
    },

    getByDomain(domainSchemaId: string): Promise<readonly EvolutionProposal[]> {
      const result = [...proposals.values()].filter(
        (p) => p.domainSchemaId === domainSchemaId,
      );
      return Promise.resolve(result);
    },

    update(id: string, updates: UpdateEvolutionProposalInput): Promise<void> {
      const existing = proposals.get(id);
      if (!existing) {
        return Promise.reject(new PersistenceError(`Evolution proposal not found: ${id}`));
      }

      const updated: EvolutionProposal = {
        ...existing,
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.status !== undefined && { reviewedAt: new Date() }),
        ...(updates.appliedAt !== undefined && { appliedAt: updates.appliedAt }),
      };
      proposals.set(id, updated);
      return Promise.resolve();
    },
  };
}
