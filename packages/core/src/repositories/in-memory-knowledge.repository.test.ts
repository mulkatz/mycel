import { describe, it, expect } from 'vitest';
import { createInMemoryKnowledgeRepository } from './in-memory-knowledge.repository.js';
import { createMockEmbeddingClient } from '../embedding/mock-embedding-client.js';
import type { CreateKnowledgeEntryInput } from './knowledge.repository.js';

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
    domainSchemaId: 'test-domain',
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

  it('should query uncategorized entries with draft status only', async () => {
    const repo = createInMemoryKnowledgeRepository();
    const entry1 = await repo.create(createTestEntryInput({ categoryId: '_uncategorized' }));
    await repo.create(createTestEntryInput({ categoryId: 'history' }));
    await repo.create(createTestEntryInput({ categoryId: '_uncategorized' }));

    // Migrate one entry — it should no longer appear in uncategorized
    await repo.update(entry1.id, {
      status: 'migrated',
      categoryId: 'history',
      migratedFrom: '_uncategorized',
    });

    const results = await repo.getUncategorized();
    expect(results).toHaveLength(1);
    for (const entry of results) {
      expect(entry.categoryId).toBe('_uncategorized');
      expect(entry.status).toBe('draft');
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

  it('should throw when updating a nonexistent entry', async () => {
    const repo = createInMemoryKnowledgeRepository();
    await expect(repo.update('nonexistent', { status: 'confirmed' })).rejects.toThrow(
      'Knowledge entry not found',
    );
  });

  describe('searchSimilar', () => {
    it('should return entries with similar embeddings', async () => {
      const repo = createInMemoryKnowledgeRepository();
      const embeddingClient = createMockEmbeddingClient();

      const embedding = await embeddingClient.generateEmbedding('church history');
      await repo.create(
        createTestEntryInput({
          domainSchemaId: 'community',
          embedding,
          embeddingModel: 'test-model',
        }),
      );

      // Search with the same embedding — should find it
      const results = await repo.searchSimilar({
        domainSchemaId: 'community',
        embedding,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('should filter by domainSchemaId', async () => {
      const repo = createInMemoryKnowledgeRepository();
      const embedding = new Array(768).fill(0.1);

      await repo.create(createTestEntryInput({ domainSchemaId: 'domain-a', embedding }));
      await repo.create(createTestEntryInput({ domainSchemaId: 'domain-b', embedding }));

      const results = await repo.searchSimilar({
        domainSchemaId: 'domain-a',
        embedding,
      });

      expect(results).toHaveLength(1);
    });

    it('should exclude entries from specified session', async () => {
      const repo = createInMemoryKnowledgeRepository();
      const embedding = new Array(768).fill(0.1);

      await repo.create(
        createTestEntryInput({ sessionId: 'session-1', domainSchemaId: 'community', embedding }),
      );
      await repo.create(
        createTestEntryInput({ sessionId: 'session-2', domainSchemaId: 'community', embedding }),
      );

      const results = await repo.searchSimilar({
        domainSchemaId: 'community',
        embedding,
        excludeSessionId: 'session-1',
      });

      expect(results).toHaveLength(1);
      expect(results[0].entry.sessionId).toBe('session-2');
    });

    it('should respect limit parameter', async () => {
      const repo = createInMemoryKnowledgeRepository();
      const embedding = new Array(768).fill(0.1);

      for (let i = 0; i < 10; i++) {
        await repo.create(
          createTestEntryInput({
            sessionId: `session-${String(i)}`,
            domainSchemaId: 'community',
            embedding,
          }),
        );
      }

      const results = await repo.searchSimilar({
        domainSchemaId: 'community',
        embedding,
        limit: 3,
      });

      expect(results).toHaveLength(3);
    });

    it('should skip entries without embeddings', async () => {
      const repo = createInMemoryKnowledgeRepository();
      const embedding = new Array(768).fill(0.1);

      await repo.create(createTestEntryInput({ domainSchemaId: 'community' })); // no embedding
      await repo.create(createTestEntryInput({ domainSchemaId: 'community', embedding }));

      const results = await repo.searchSimilar({
        domainSchemaId: 'community',
        embedding,
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty when no entries match', async () => {
      const repo = createInMemoryKnowledgeRepository();
      const embedding = new Array(768).fill(0.1);

      const results = await repo.searchSimilar({
        domainSchemaId: 'nonexistent',
        embedding,
      });

      expect(results).toEqual([]);
    });
  });
});
