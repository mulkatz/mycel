import { randomUUID } from 'node:crypto';
import type { CachedSearchResult } from '@mycel/shared/src/types/enrichment.types.js';
import type { SearchCacheRepository } from './search-cache.repository.js';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

export function createInMemorySearchCacheRepository(): SearchCacheRepository {
  const cache = new Map<string, CachedSearchResult>();

  return {
    get(query: string): Promise<CachedSearchResult | null> {
      const key = normalizeQuery(query);
      const entry = cache.get(key);

      if (!entry) {
        return Promise.resolve(null);
      }

      if (entry.expiresAt.getTime() < Date.now()) {
        cache.delete(key);
        return Promise.resolve(null);
      }

      return Promise.resolve(entry);
    },

    set(
      query: string,
      result: { content: string; sourceUrls: readonly string[] },
    ): Promise<void> {
      const key = normalizeQuery(query);
      const now = new Date();
      const entry: CachedSearchResult = {
        id: randomUUID(),
        query: key,
        content: result.content,
        sourceUrls: result.sourceUrls,
        cachedAt: now,
        expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS),
      };
      cache.set(key, entry);
      return Promise.resolve();
    },
  };
}
