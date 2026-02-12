import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemorySearchCacheRepository } from './in-memory-search-cache.repository.js';

describe('InMemorySearchCacheRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null for cache miss', async () => {
    const repo = createInMemorySearchCacheRepository();
    const result = await repo.get('some query');
    expect(result).toBeNull();
  });

  it('should cache and retrieve a result', async () => {
    const repo = createInMemorySearchCacheRepository();
    await repo.set('test query', {
      content: 'Search results here',
      sourceUrls: ['https://example.com'],
    });

    const result = await repo.get('test query');
    expect(result).not.toBeNull();
    expect(result?.content).toBe('Search results here');
    expect(result?.sourceUrls).toEqual(['https://example.com']);
    expect(result?.cachedAt).toBeInstanceOf(Date);
    expect(result?.expiresAt).toBeInstanceOf(Date);
  });

  it('should normalize queries (case-insensitive, trimmed)', async () => {
    const repo = createInMemorySearchCacheRepository();
    await repo.set('  Test Query  ', {
      content: 'result',
      sourceUrls: [],
    });

    const result = await repo.get('test query');
    expect(result).not.toBeNull();
    expect(result?.content).toBe('result');
  });

  it('should return null for expired entries', async () => {
    const repo = createInMemorySearchCacheRepository();
    const now = Date.now();

    // Mock Date.now to simulate time passing
    await repo.set('test query', {
      content: 'old result',
      sourceUrls: [],
    });

    // Fast-forward past TTL (7 days + 1 hour)
    vi.spyOn(Date, 'now').mockReturnValue(now + 7 * 24 * 60 * 60 * 1000 + 3600000);

    const result = await repo.get('test query');
    expect(result).toBeNull();
  });

  it('should overwrite existing cache entries', async () => {
    const repo = createInMemorySearchCacheRepository();
    await repo.set('test query', { content: 'first', sourceUrls: [] });
    await repo.set('test query', { content: 'second', sourceUrls: ['https://new.com'] });

    const result = await repo.get('test query');
    expect(result?.content).toBe('second');
    expect(result?.sourceUrls).toEqual(['https://new.com']);
  });
});
