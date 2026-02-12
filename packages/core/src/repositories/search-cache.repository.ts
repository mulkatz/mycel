import type { CachedSearchResult } from '@mycel/shared/src/types/enrichment.types.js';

export interface SearchCacheRepository {
  get(query: string): Promise<CachedSearchResult | null>;
  set(
    query: string,
    result: { content: string; sourceUrls: readonly string[] },
  ): Promise<void>;
}
