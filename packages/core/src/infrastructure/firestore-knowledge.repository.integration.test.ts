import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { createFirestoreKnowledgeRepository } from './firestore-knowledge.repository.js';
import type { CreateKnowledgeEntryInput } from '../repositories/knowledge.repository.js';

function createTestEntryInput(
  overrides: Partial<CreateKnowledgeEntryInput> = {},
): CreateKnowledgeEntryInput {
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

describe('FirestoreKnowledgeRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const repo = createFirestoreKnowledgeRepository(db);

  beforeEach(async () => {
    const docs = await db.collection('knowledgeEntries').listDocuments();
    for (const doc of docs) {
      await doc.delete();
    }
  });

  it('should create and retrieve a knowledge entry', async () => {
    const entry = await repo.create(createTestEntryInput());

    expect(entry.id).toBeTruthy();
    expect(entry.categoryId).toBe('history');
    expect(entry.status).toBe('draft');
    expect(entry.topicKeywords).toEqual(['church', 'medieval']);
    expect(entry.createdAt).toBeInstanceOf(Date);

    const loaded = await repo.getById(entry.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(entry.id);
    expect(loaded?.title).toBe('Old Church Construction');
  });

  it('should return null for nonexistent entry', async () => {
    const result = await repo.getById('nonexistent');
    expect(result).toBeNull();
  });

  it('should query entries by session', async () => {
    await repo.create(createTestEntryInput({ sessionId: 'session-1' }));
    await repo.create(createTestEntryInput({ sessionId: 'session-1' }));
    await repo.create(createTestEntryInput({ sessionId: 'session-2' }));

    const results = await repo.getBySession('session-1');
    expect(results).toHaveLength(2);
  });

  it('should query entries by category', async () => {
    await repo.create(createTestEntryInput({ categoryId: 'history' }));
    await repo.create(createTestEntryInput({ categoryId: 'nature' }));
    await repo.create(createTestEntryInput({ categoryId: 'history' }));

    const results = await repo.getByCategory('history');
    expect(results).toHaveLength(2);
  });

  it('should query uncategorized entries', async () => {
    await repo.create(createTestEntryInput({ categoryId: '_uncategorized' }));
    await repo.create(createTestEntryInput({ categoryId: 'history' }));
    await repo.create(
      createTestEntryInput({
        categoryId: '_uncategorized',
        topicKeywords: ['mysterious', 'unclassified'],
      }),
    );

    const results = await repo.getUncategorized();
    expect(results).toHaveLength(2);
    for (const entry of results) {
      expect(entry.categoryId).toBe('_uncategorized');
    }
  });

  it('should query by topic keywords using array-contains-any', async () => {
    await repo.create(createTestEntryInput({ topicKeywords: ['church', 'medieval'] }));
    await repo.create(createTestEntryInput({ topicKeywords: ['river', 'nature'] }));
    await repo.create(createTestEntryInput({ topicKeywords: ['medieval', 'castle'] }));

    const results = await repo.queryByTopicKeywords(['medieval']);
    expect(results).toHaveLength(2);
  });

  it('should return empty for non-matching keywords', async () => {
    await repo.create(createTestEntryInput({ topicKeywords: ['church'] }));

    const results = await repo.queryByTopicKeywords(['nonexistent']);
    expect(results).toEqual([]);
  });

  it('should return empty for empty keywords array', async () => {
    await repo.create(createTestEntryInput());

    const results = await repo.queryByTopicKeywords([]);
    expect(results).toEqual([]);
  });

  it('should update entry status and category (migration)', async () => {
    const entry = await repo.create(
      createTestEntryInput({ categoryId: '_uncategorized' }),
    );

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
  });
});
