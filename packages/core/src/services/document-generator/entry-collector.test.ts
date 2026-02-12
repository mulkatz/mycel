import { describe, it, expect } from 'vitest';
import { createInMemoryKnowledgeRepository } from '../../repositories/in-memory-knowledge.repository.js';
import { collectEntries } from './entry-collector.js';
import type { CreateKnowledgeEntryInput } from '../../repositories/knowledge.repository.js';

function makeEntryInput(overrides: Partial<CreateKnowledgeEntryInput> = {}): CreateKnowledgeEntryInput {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    categoryId: 'history',
    confidence: 0.9,
    topicKeywords: ['test'],
    rawInput: 'test input',
    domainSchemaId: 'test-domain',
    title: 'Test Entry',
    content: 'Test content',
    source: { type: 'text' },
    structuredData: {},
    tags: ['test'],
    metadata: {},
    ...overrides,
  };
}

describe('collectEntries', () => {
  it('should group entries by categoryId', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(makeEntryInput({ categoryId: 'history', title: 'History 1' }));
    await repo.create(makeEntryInput({ categoryId: 'history', title: 'History 2' }));
    await repo.create(makeEntryInput({ categoryId: 'nature', title: 'Nature 1' }));

    const result = await collectEntries(repo, 'test-domain');

    expect(result.size).toBe(2);
    expect(result.get('history')?.length).toBe(2);
    expect(result.get('nature')?.length).toBe(1);
  });

  it('should return empty map when no entries exist', async () => {
    const repo = createInMemoryKnowledgeRepository();

    const result = await collectEntries(repo, 'test-domain');

    expect(result.size).toBe(0);
  });

  it('should only include entries for the specified domain', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(makeEntryInput({ domainSchemaId: 'test-domain', title: 'Ours' }));
    await repo.create(makeEntryInput({ domainSchemaId: 'other-domain', title: 'Theirs' }));

    const result = await collectEntries(repo, 'test-domain');

    expect(result.size).toBe(1);
    expect(result.get('history')?.[0].title).toBe('Ours');
  });

  it('should handle uncategorized entries', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(makeEntryInput({ categoryId: '_uncategorized', title: 'Misc' }));

    const result = await collectEntries(repo, 'test-domain');

    expect(result.get('_uncategorized')?.length).toBe(1);
  });
});
