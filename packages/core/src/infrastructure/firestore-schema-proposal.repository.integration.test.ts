import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { resolveBehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import { createFirestoreSchemaProposalRepository } from './firestore-schema-proposal.repository.js';

const testSchema: DomainConfig = {
  name: 'test-generated',
  version: '1.0.0',
  description: 'A test generated domain',
  categories: [
    { id: 'general', label: 'General', description: 'General knowledge' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

describe('FirestoreSchemaProposalRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const repo = createFirestoreSchemaProposalRepository(db);

  beforeEach(async () => {
    const docs = await db.collection('schema-proposals').listDocuments();
    for (const doc of docs) {
      await doc.delete();
    }
  });

  it('should save and retrieve a proposal', async () => {
    const proposal = await repo.saveProposal({
      description: 'Village knowledge base',
      language: 'de',
      proposedSchema: testSchema,
      behavior: resolveBehaviorPreset('balanced'),
      reasoning: 'Based on web research',
      sources: ['https://example.com/source1'],
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe('pending');
    expect(proposal.description).toBe('Village knowledge base');

    const fetched = await repo.getProposal(proposal.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.proposedSchema.name).toBe('test-generated');
    expect(fetched?.behavior.webSearch).toBe('bootstrap_only');
  });

  it('should return null for nonexistent proposal', async () => {
    const result = await repo.getProposal('nonexistent-id');
    expect(result).toBeNull();
  });

  it('should update proposal status to approved', async () => {
    const proposal = await repo.saveProposal({
      description: 'Test',
      language: 'de',
      proposedSchema: testSchema,
      behavior: resolveBehaviorPreset('balanced'),
      reasoning: 'Test reasoning',
      sources: [],
    });

    const updated = await repo.updateProposal(proposal.id, {
      status: 'approved',
      resultingDomainSchemaId: 'domain-abc',
    });

    expect(updated.status).toBe('approved');
    expect(updated.resultingDomainSchemaId).toBe('domain-abc');
    expect(updated.reviewedAt).toBeInstanceOf(Date);
  });

  it('should update proposal status to rejected with feedback', async () => {
    const proposal = await repo.saveProposal({
      description: 'Test',
      language: 'de',
      proposedSchema: testSchema,
      behavior: resolveBehaviorPreset('balanced'),
      reasoning: 'Test reasoning',
      sources: [],
    });

    const updated = await repo.updateProposal(proposal.id, {
      status: 'rejected',
      feedback: 'Needs more categories',
    });

    expect(updated.status).toBe('rejected');
    expect(updated.feedback).toBe('Needs more categories');
  });

  it('should throw when updating nonexistent proposal', async () => {
    await expect(
      repo.updateProposal('nonexistent-id', { status: 'approved' }),
    ).rejects.toThrow('Schema proposal not found');
  });
});
