import { describe, it, expect } from 'vitest';
import { createInMemorySchemaProposalRepository } from './in-memory-schema-proposal.repository.js';
import { resolveBehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import type { CreateSchemaProposalInput } from './schema-proposal.repository.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';

const testSchema: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    { id: 'general', label: 'General', description: 'General knowledge' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

const testInput: CreateSchemaProposalInput = {
  description: 'A village knowledge base',
  language: 'de',
  proposedSchema: testSchema,
  behavior: resolveBehaviorPreset('balanced'),
  reasoning: 'Based on web research',
  sources: ['https://example.com'],
};

describe('InMemorySchemaProposalRepository', () => {
  it('should save and retrieve a proposal', async () => {
    const repo = createInMemorySchemaProposalRepository();
    const proposal = await repo.saveProposal(testInput);

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe('pending');
    expect(proposal.description).toBe('A village knowledge base');
    expect(proposal.proposedSchema.name).toBe('test-domain');
    expect(proposal.createdAt).toBeInstanceOf(Date);

    const fetched = await repo.getProposal(proposal.id);
    expect(fetched).toEqual(proposal);
  });

  it('should return null for nonexistent proposal', async () => {
    const repo = createInMemorySchemaProposalRepository();
    const result = await repo.getProposal('nonexistent');
    expect(result).toBeNull();
  });

  it('should update proposal status', async () => {
    const repo = createInMemorySchemaProposalRepository();
    const proposal = await repo.saveProposal(testInput);

    const updated = await repo.updateProposal(proposal.id, {
      status: 'approved',
      resultingDomainSchemaId: 'domain-123',
    });

    expect(updated.status).toBe('approved');
    expect(updated.resultingDomainSchemaId).toBe('domain-123');
    expect(updated.reviewedAt).toBeInstanceOf(Date);
  });

  it('should update proposal with feedback on rejection', async () => {
    const repo = createInMemorySchemaProposalRepository();
    const proposal = await repo.saveProposal(testInput);

    const updated = await repo.updateProposal(proposal.id, {
      status: 'rejected',
      feedback: 'Categories are too broad',
    });

    expect(updated.status).toBe('rejected');
    expect(updated.feedback).toBe('Categories are too broad');
  });

  it('should update proposed schema', async () => {
    const repo = createInMemorySchemaProposalRepository();
    const proposal = await repo.saveProposal(testInput);

    const modifiedSchema: DomainConfig = {
      ...testSchema,
      name: 'modified-domain',
    };

    const updated = await repo.updateProposal(proposal.id, {
      proposedSchema: modifiedSchema,
    });

    expect(updated.proposedSchema.name).toBe('modified-domain');
  });

  it('should reject update for nonexistent proposal', async () => {
    const repo = createInMemorySchemaProposalRepository();
    await expect(
      repo.updateProposal('nonexistent', { status: 'approved' }),
    ).rejects.toThrow('Schema proposal not found');
  });
});
