import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { createFirestoreSearchCacheRepository } from './firestore-search-cache.repository.js';

describe('FirestoreSearchCacheRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const repo = createFirestoreSearchCacheRepository(db);

  beforeEach(async () => {
    const docs = await db.collection('search-cache').listDocuments();
    for (const doc of docs) {
      await doc.delete();
    }
  });

  it('should return null for cache miss', async () => {
    const result = await repo.get('nonexistent query');
    expect(result).toBeNull();
  });

  it('should cache and retrieve a result', async () => {
    await repo.set('test query', {
      content: 'Search results',
      sourceUrls: ['https://example.com'],
    });

    const result = await repo.get('test query');
    expect(result).not.toBeNull();
    expect(result?.content).toBe('Search results');
    expect(result?.sourceUrls).toEqual(['https://example.com']);
  });

  it('should normalize queries for cache hits', async () => {
    await repo.set('  Test Query  ', {
      content: 'result',
      sourceUrls: [],
    });

    const result = await repo.get('test query');
    expect(result).not.toBeNull();
    expect(result?.content).toBe('result');
  });
});
