import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { createFirestoreEvolutionProposalRepository } from './firestore-evolution-proposal.repository.js';
import type { CreateEvolutionProposalInput } from '../repositories/evolution-proposal.repository.js';

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

describe('FirestoreEvolutionProposalRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const tenantBase = db.collection('tenants').doc('test-tenant');
  const repo = createFirestoreEvolutionProposalRepository(tenantBase);

  beforeEach(async () => {
    const docs = await tenantBase.collection('evolution-proposals').listDocuments();
    for (const doc of docs) {
      await doc.delete();
    }
  });

  it('should create and retrieve a proposal', async () => {
    const proposal = await repo.create(testInput);

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe('pending');
    expect(proposal.type).toBe('new_category');
    expect(proposal.domainSchemaId).toBe('domain-1');

    const fetched = await repo.getById(proposal.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.newCategory?.id).toBe('traditions');
  });

  it('should return null for nonexistent proposal', async () => {
    const result = await repo.getById('nonexistent-id');
    expect(result).toBeNull();
  });

  it('should list pending proposals by domain', async () => {
    await repo.create(testInput);
    await repo.create({ ...testInput, domainSchemaId: 'domain-2' });

    const proposals = await repo.getPendingByDomain('domain-1');
    expect(proposals).toHaveLength(1);
  });

  it('should update proposal status', async () => {
    const proposal = await repo.create(testInput);
    await repo.update(proposal.id, { status: 'approved' });

    const updated = await repo.getById(proposal.id);
    expect(updated?.status).toBe('approved');
    expect(updated?.reviewedAt).toBeInstanceOf(Date);
  });

  it('should throw when updating nonexistent proposal', async () => {
    await expect(
      repo.update('nonexistent-id', { status: 'approved' }),
    ).rejects.toThrow('Evolution proposal not found');
  });
});
