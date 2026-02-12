import { randomUUID } from 'node:crypto';
import type {
  KnowledgeEntry,
  KnowledgeSearchResult,
} from '@mycel/shared/src/types/knowledge.types.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateKnowledgeEntryInput,
  KnowledgeRepository,
  UpdateKnowledgeEntryInput,
} from './knowledge.repository.js';

const MIN_SIMILARITY_SCORE = 0.7;
const DEFAULT_SEARCH_LIMIT = 5;

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export function createInMemoryKnowledgeRepository(): KnowledgeRepository {
  const entries = new Map<string, KnowledgeEntry>();

  return {
    create(input: CreateKnowledgeEntryInput): Promise<KnowledgeEntry> {
      const now = new Date();
      const entry: KnowledgeEntry = {
        id: randomUUID(),
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        title: input.title,
        content: input.content,
        source: input.source,
        structuredData: input.structuredData,
        tags: input.tags,
        metadata: input.metadata,
        followUp: input.followUp,
        createdAt: now,
        updatedAt: now,
        sessionId: input.sessionId,
        turnId: input.turnId,
        confidence: input.confidence,
        suggestedCategoryLabel: input.suggestedCategoryLabel,
        topicKeywords: input.topicKeywords,
        rawInput: input.rawInput,
        status: 'draft',
        domainSchemaId: input.domainSchemaId,
        embedding: input.embedding ? [...input.embedding] : undefined,
        embeddingModel: input.embeddingModel,
        embeddingGeneratedAt: input.embedding ? now : undefined,
      };
      entries.set(entry.id, entry);
      return Promise.resolve(entry);
    },

    getById(id: string): Promise<KnowledgeEntry | null> {
      return Promise.resolve(entries.get(id) ?? null);
    },

    getBySession(sessionId: string): Promise<readonly KnowledgeEntry[]> {
      return Promise.resolve([...entries.values()].filter((e) => e.sessionId === sessionId));
    },

    getByCategory(category: string): Promise<readonly KnowledgeEntry[]> {
      return Promise.resolve([...entries.values()].filter((e) => e.categoryId === category));
    },

    getUncategorized(): Promise<readonly KnowledgeEntry[]> {
      return Promise.resolve(
        [...entries.values()].filter(
          (e) => e.categoryId === '_uncategorized' && e.status === 'draft',
        ),
      );
    },

    queryByTopicKeywords(keywords: readonly string[]): Promise<readonly KnowledgeEntry[]> {
      return Promise.resolve(
        [...entries.values()].filter((e) => e.topicKeywords?.some((k) => keywords.includes(k))),
      );
    },

    searchSimilar(params: {
      domainSchemaId: string;
      embedding: readonly number[];
      limit?: number;
      excludeSessionId?: string;
    }): Promise<readonly KnowledgeSearchResult[]> {
      const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;

      const candidates = [...entries.values()].filter((e) => {
        if (e.domainSchemaId !== params.domainSchemaId) return false;
        if (!e.embedding || e.embedding.length === 0) return false;
        if (params.excludeSessionId && e.sessionId === params.excludeSessionId) return false;
        return true;
      });

      const scored: KnowledgeSearchResult[] = candidates
        .map((entry) => ({
          entry,
          score: cosineSimilarity(params.embedding, entry.embedding ?? []),
        }))
        .filter((r) => r.score >= MIN_SIMILARITY_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return Promise.resolve(scored);
    },

    update(id: string, updates: UpdateKnowledgeEntryInput): Promise<void> {
      const entry = entries.get(id);
      if (!entry) {
        return Promise.reject(new PersistenceError(`Knowledge entry not found: ${id}`));
      }
      const updated: KnowledgeEntry = {
        ...entry,
        ...(updates.categoryId !== undefined && { categoryId: updates.categoryId }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.migratedFrom !== undefined && {
          migratedFrom: updates.migratedFrom,
          migratedAt: new Date(),
        }),
        ...(updates.structuredData !== undefined && { structuredData: updates.structuredData }),
        ...(updates.tags !== undefined && { tags: updates.tags }),
        ...(updates.metadata !== undefined && { metadata: updates.metadata }),
        updatedAt: new Date(),
      };
      entries.set(id, updated);
      return Promise.resolve();
    },
  };
}
