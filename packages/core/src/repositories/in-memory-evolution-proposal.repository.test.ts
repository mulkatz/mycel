import { describe, it, expect } from 'vitest';
import { createInMemoryEvolutionProposalRepository } from './in-memory-evolution-proposal.repository.js';
import type { CreateEvolutionProposalInput } from './evolution-proposal.repository.js';

const testInput: CreateEvolutionProposalInput = {
  domainSchemaId: 'domain-1',
  type: 'new_category',
  description: 'New category for local traditions',
  evidence: ['entry-1', 'entry-2', 'entry-3'],
  confidence: 0.85,
  newCategory: {
    id: 'traditions',
    label: 'Local Traditions',
    description: 'Traditional customs and celebrations',
    suggestedFields: ['name', 'season', 'participants'],
  },
  clusterMetadata: {
    centroidEntryId: 'entry-1',
    clusterSize: 3,
    averageSimilarity: 0.87,
    topKeywords: ['tradition', 'festival', 'celebration'],
  },
};

describe('InMemoryEvolutionProposalRepository', () => {
  it('should create and retrieve a proposal', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    const proposal = await repo.create(testInput);

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe('pending');
    expect(proposal.type).toBe('new_category');
    expect(proposal.domainSchemaId).toBe('domain-1');
    expect(proposal.newCategory?.id).toBe('traditions');
    expect(proposal.createdAt).toBeInstanceOf(Date);

    const fetched = await repo.getById(proposal.id);
    expect(fetched).toEqual(proposal);
  });

  it('should return null for nonexistent proposal', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    const result = await repo.getById('nonexistent');
    expect(result).toBeNull();
  });

  it('should list pending proposals by domain', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    await repo.create(testInput);
    await repo.create({ ...testInput, domainSchemaId: 'domain-2' });

    const proposals = await repo.getPendingByDomain('domain-1');
    expect(proposals).toHaveLength(1);
    expect(proposals[0].domainSchemaId).toBe('domain-1');
  });

  it('should list all proposals by domain', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    const p1 = await repo.create(testInput);
    await repo.create(testInput);

    await repo.update(p1.id, { status: 'approved' });

    const all = await repo.getByDomain('domain-1');
    expect(all).toHaveLength(2);

    const pending = await repo.getPendingByDomain('domain-1');
    expect(pending).toHaveLength(1);
  });

  it('should update proposal status', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    const proposal = await repo.create(testInput);

    await repo.update(proposal.id, { status: 'approved' });

    const updated = await repo.getById(proposal.id);
    expect(updated?.status).toBe('approved');
    expect(updated?.reviewedAt).toBeInstanceOf(Date);
  });

  it('should update proposal with appliedAt', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    const proposal = await repo.create(testInput);
    const now = new Date();

    await repo.update(proposal.id, { status: 'auto_applied', appliedAt: now });

    const updated = await repo.getById(proposal.id);
    expect(updated?.status).toBe('auto_applied');
    expect(updated?.appliedAt).toEqual(now);
  });

  it('should reject update for nonexistent proposal', async () => {
    const repo = createInMemoryEvolutionProposalRepository();
    await expect(
      repo.update('nonexistent', { status: 'approved' }),
    ).rejects.toThrow('Evolution proposal not found');
  });
});
