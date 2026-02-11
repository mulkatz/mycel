import { describe, it, expect } from 'vitest';
import { createInMemoryKnowledgeRepository } from './in-memory-knowledge.repository.js';
import type { CreateKnowledgeEntryInput } from './knowledge.repository.js';

function createTestEntryInput(overrides: Partial<CreateKnowledgeEntryInput> = {}): CreateKnowledgeEntryInput {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    categoryId: 'history',
    confidence: 0.9,
    suggestedCategoryLabel: 'History & Heritage',
    topicKeywords: ['church', 'medieval'],
    rawInput: 'The old church was built in 1450',
    title: 'Old Church Construction',
    content: 'The old church in the village was built in 1450.',
    source: { type: 'text' },
    structuredData: { period: '1450', sources: ['oral tradition'] },
    tags: ['history', 'architecture'],
    metadata: {},
    ...overrides,
  };
}

describe('createInMemoryKnowledgeRepository', () => {
  it('should create a knowledge entry with generated id and timestamps', async () => {
    const repo = createInMemoryKnowledgeRepository();
    const entry = await repo.create(createTestEntryInput());

    expect(entry.id).toBeDefined();
    expect(entry.categoryId).toBe('history');
    expect(entry.sessionId).toBe('session-1');
    expect(entry.turnId).toBe('turn-1');
    expect(entry.confidence).toBe(0.9);
    expect(entry.topicKeywords).toEqual(['church', 'medieval']);
    expect(entry.status).toBe('draft');
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('should retrieve an entry by id', async () => {
    const repo = createInMemoryKnowledgeRepository();
    const created = await repo.create(createTestEntryInput());

    const loaded = await repo.getById(created.id);
    expect(loaded).toEqual(created);
  });

  it('should return null for nonexistent entry', async () => {
    const repo = createInMemoryKnowledgeRepository();
    const loaded = await repo.getById('nonexistent');
    expect(loaded).toBeNull();
  });

  it('should query entries by session id', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(createTestEntryInput({ sessionId: 'session-1' }));
    await repo.create(createTestEntryInput({ sessionId: 'session-1' }));
    await repo.create(createTestEntryInput({ sessionId: 'session-2' }));

    const results = await repo.getBySession('session-1');
    expect(results).toHaveLength(2);
  });

  it('should query entries by category', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(createTestEntryInput({ categoryId: 'history' }));
    await repo.create(createTestEntryInput({ categoryId: 'nature' }));
    await repo.create(createTestEntryInput({ categoryId: 'history' }));

    const results = await repo.getByCategory('history');
    expect(results).toHaveLength(2);
  });

  it('should query uncategorized entries', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(createTestEntryInput({ categoryId: '_uncategorized' }));
    await repo.create(createTestEntryInput({ categoryId: 'history' }));
    await repo.create(createTestEntryInput({ categoryId: '_uncategorized' }));

    const results = await repo.getUncategorized();
    expect(results).toHaveLength(2);
    for (const entry of results) {
      expect(entry.categoryId).toBe('_uncategorized');
    }
  });

  it('should query entries by topic keywords', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(createTestEntryInput({ topicKeywords: ['church', 'medieval'] }));
    await repo.create(createTestEntryInput({ topicKeywords: ['river', 'nature'] }));
    await repo.create(createTestEntryInput({ topicKeywords: ['medieval', 'castle'] }));

    const results = await repo.queryByTopicKeywords(['medieval']);
    expect(results).toHaveLength(2);
  });

  it('should return empty array when no keywords match', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await repo.create(createTestEntryInput({ topicKeywords: ['church'] }));

    const results = await repo.queryByTopicKeywords(['nonexistent']);
    expect(results).toEqual([]);
  });

  it('should update an entry status', async () => {
    const repo = createInMemoryKnowledgeRepository();
    const entry = await repo.create(createTestEntryInput({ categoryId: '_uncategorized' }));

    await repo.update(entry.id, {
      categoryId: 'history',
      status: 'migrated',
      migratedFrom: '_uncategorized',
    });

    const updated = await repo.getById(entry.id);
    expect(updated?.categoryId).toBe('history');
    expect(updated?.status).toBe('migrated');
    expect(updated?.migratedFrom).toBe('_uncategorized');
    expect(updated?.migratedAt).toBeInstanceOf(Date);
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(entry.updatedAt.getTime());
  });
});
