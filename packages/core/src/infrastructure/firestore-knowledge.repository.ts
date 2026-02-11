import type { Firestore } from '@google-cloud/firestore';
import { Timestamp } from '@google-cloud/firestore';
import type { KnowledgeEntry, KnowledgeEntryStatus } from '@mycel/shared/src/types/knowledge.types.js';
import type {
  CreateKnowledgeEntryInput,
  KnowledgeRepository,
  UpdateKnowledgeEntryInput,
} from '../repositories/knowledge.repository.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';

const COLLECTION = 'knowledgeEntries';

interface KnowledgeEntryDocument {
  sessionId: string;
  turnId: string;
  categoryId: string;
  subcategoryId?: string | null;
  confidence: number;
  suggestedCategoryLabel: string;
  topicKeywords: string[];
  rawInput: string;
  title: string;
  content: string;
  source: Record<string, unknown>;
  structuredData: Record<string, unknown>;
  tags: string[];
  metadata: Record<string, unknown>;
  followUp?: Record<string, unknown>;
  status: KnowledgeEntryStatus;
  migratedFrom?: string;
  migratedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function entryFromDoc(id: string, data: KnowledgeEntryDocument): KnowledgeEntry {
  return {
    id,
    sessionId: data.sessionId,
    turnId: data.turnId,
    categoryId: data.categoryId,
    subcategoryId: data.subcategoryId,
    confidence: data.confidence,
    suggestedCategoryLabel: data.suggestedCategoryLabel,
    topicKeywords: data.topicKeywords,
    rawInput: data.rawInput,
    title: data.title,
    content: data.content,
    source: data.source as unknown as KnowledgeEntry['source'],
    structuredData: data.structuredData,
    tags: data.tags,
    metadata: data.metadata,
    followUp: data.followUp as KnowledgeEntry['followUp'],
    status: data.status,
    migratedFrom: data.migratedFrom,
    migratedAt: data.migratedAt?.toDate(),
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

export function createFirestoreKnowledgeRepository(db: Firestore): KnowledgeRepository {
  const collectionRef = db.collection(COLLECTION);

  return {
    async create(input: CreateKnowledgeEntryInput): Promise<KnowledgeEntry> {
      const now = Timestamp.now();
      const docData: KnowledgeEntryDocument = {
        sessionId: input.sessionId,
        turnId: input.turnId,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        confidence: input.confidence,
        suggestedCategoryLabel: input.suggestedCategoryLabel,
        topicKeywords: [...input.topicKeywords],
        rawInput: input.rawInput,
        title: input.title,
        content: input.content,
        source: input.source as unknown as Record<string, unknown>,
        structuredData: input.structuredData,
        tags: [...input.tags],
        metadata: input.metadata,
        followUp: input.followUp as unknown as Record<string, unknown> | undefined,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };

      const docRef = collectionRef.doc();
      await docRef.set(docData);

      return entryFromDoc(docRef.id, docData);
    },

    async getById(id: string): Promise<KnowledgeEntry | null> {
      const doc = await collectionRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return entryFromDoc(id, doc.data() as KnowledgeEntryDocument);
    },

    async getBySession(sessionId: string): Promise<readonly KnowledgeEntry[]> {
      const snapshot = await collectionRef
        .where('sessionId', '==', sessionId)
        .orderBy('createdAt', 'asc')
        .get();

      return snapshot.docs.map((doc) =>
        entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument),
      );
    },

    async getByCategory(category: string): Promise<readonly KnowledgeEntry[]> {
      const snapshot = await collectionRef
        .where('categoryId', '==', category)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) =>
        entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument),
      );
    },

    async getUncategorized(): Promise<readonly KnowledgeEntry[]> {
      const snapshot = await collectionRef
        .where('categoryId', '==', '_uncategorized')
        .where('status', '==', 'draft')
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) =>
        entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument),
      );
    },

    async queryByTopicKeywords(keywords: readonly string[]): Promise<readonly KnowledgeEntry[]> {
      if (keywords.length === 0) {
        return [];
      }

      // Firestore array-contains-any supports up to 30 values
      const queryKeywords = keywords.slice(0, 30);
      const snapshot = await collectionRef
        .where('topicKeywords', 'array-contains-any', queryKeywords)
        .get();

      return snapshot.docs.map((doc) =>
        entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument),
      );
    },

    async update(id: string, updates: UpdateKnowledgeEntryInput): Promise<void> {
      const updateData: Record<string, unknown> = {
        updatedAt: Timestamp.now(),
      };

      if (updates.categoryId !== undefined) {
        updateData['categoryId'] = updates.categoryId;
      }
      if (updates.status !== undefined) {
        updateData['status'] = updates.status;
      }
      if (updates.migratedFrom !== undefined) {
        updateData['migratedFrom'] = updates.migratedFrom;
        updateData['migratedAt'] = Timestamp.now();
      }
      if (updates.structuredData !== undefined) {
        updateData['structuredData'] = updates.structuredData;
      }
      if (updates.tags !== undefined) {
        updateData['tags'] = [...updates.tags];
      }
      if (updates.metadata !== undefined) {
        updateData['metadata'] = updates.metadata;
      }

      try {
        await collectionRef.doc(id).update(updateData);
      } catch (error) {
        throw new PersistenceError(
          `Failed to update knowledge entry ${id}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
