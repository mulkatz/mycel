import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { Timestamp } from '@google-cloud/firestore';
import type { CachedSearchResult } from '@mycel/shared/src/types/enrichment.types.js';
import type { SearchCacheRepository } from '../repositories/search-cache.repository.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('firestore:search-cache');

const COLLECTION = 'search-cache';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheDocument {
  query: string;
  content: string;
  sourceUrls: string[];
  cachedAt: Timestamp;
  expiresAt: Timestamp;
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

function hashQuery(query: string): string {
  return createHash('sha256').update(normalizeQuery(query)).digest('hex');
}

function fromDoc(id: string, data: CacheDocument): CachedSearchResult {
  return {
    id,
    query: data.query,
    content: data.content,
    sourceUrls: data.sourceUrls,
    cachedAt: data.cachedAt.toDate(),
    expiresAt: data.expiresAt.toDate(),
  };
}

export function createFirestoreSearchCacheRepository(db: Firestore): SearchCacheRepository {
  const collectionRef = db.collection(COLLECTION);

  return {
    async get(query: string): Promise<CachedSearchResult | null> {
      const docId = hashQuery(query);
      const doc = await collectionRef.doc(docId).get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as CacheDocument;
      const result = fromDoc(doc.id, data);

      if (result.expiresAt.getTime() < Date.now()) {
        log.debug({ query: normalizeQuery(query) }, 'Cache entry expired');
        return null;
      }

      return result;
    },

    async set(
      query: string,
      result: { content: string; sourceUrls: readonly string[] },
    ): Promise<void> {
      const docId = hashQuery(query);
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + TTL_MS);

      const docData: CacheDocument = {
        query: normalizeQuery(query),
        content: result.content,
        sourceUrls: [...result.sourceUrls],
        cachedAt: now,
        expiresAt,
      };

      await collectionRef.doc(docId).set(docData);
    },
  };
}
