import { randomUUID } from 'node:crypto';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type {
  CreateKnowledgeEntryInput,
  KnowledgeRepository,
  UpdateKnowledgeEntryInput,
} from './knowledge.repository.js';

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
        [...entries.values()].filter((e) => e.categoryId === '_uncategorized'),
      );
    },

    queryByTopicKeywords(keywords: readonly string[]): Promise<readonly KnowledgeEntry[]> {
      return Promise.resolve(
        [...entries.values()].filter((e) =>
          e.topicKeywords?.some((k) => keywords.includes(k)),
        ),
      );
    },

    update(id: string, updates: UpdateKnowledgeEntryInput): Promise<void> {
      const entry = entries.get(id);
      if (!entry) {
        return Promise.resolve();
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
