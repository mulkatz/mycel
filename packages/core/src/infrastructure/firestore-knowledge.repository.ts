import type { Firestore } from '@google-cloud/firestore';
import { FieldValue, Timestamp } from '@google-cloud/firestore';
import type {
  KnowledgeEntry,
  KnowledgeEntryStatus,
  KnowledgeSearchResult,
} from '@mycel/shared/src/types/knowledge.types.js';
import type {
  CreateKnowledgeEntryInput,
  KnowledgeRepository,
  UpdateKnowledgeEntryInput,
} from '../repositories/knowledge.repository.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('firestore:knowledge');

const COLLECTION = 'knowledgeEntries';
const MIN_SIMILARITY_SCORE = 0.5;
const DEFAULT_SEARCH_LIMIT = 5;

interface KnowledgeEntryDocument {
  sessionId: string;
  turnId: string;
  categoryId: string;
  subcategoryId?: string | null;
  confidence: number;
  suggestedCategoryLabel: string;
  topicKeywords: string[];
  rawInput: string;
  domainSchemaId?: string;
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
  embeddingModel?: string;
  embeddingGeneratedAt?: Timestamp;
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
    domainSchemaId: data.domainSchemaId,
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
    embeddingModel: data.embeddingModel,
    embeddingGeneratedAt: data.embeddingGeneratedAt?.toDate(),
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

export function createFirestoreKnowledgeRepository(db: Firestore): KnowledgeRepository {
  const collectionRef = db.collection(COLLECTION);

  return {
    async create(input: CreateKnowledgeEntryInput): Promise<KnowledgeEntry> {
      const now = Timestamp.now();
      const docData: Record<string, unknown> = {
        sessionId: input.sessionId,
        turnId: input.turnId,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        confidence: input.confidence,
        suggestedCategoryLabel: input.suggestedCategoryLabel,
        topicKeywords: [...input.topicKeywords],
        rawInput: input.rawInput,
        domainSchemaId: input.domainSchemaId,
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

      if (input.embedding && input.embedding.length > 0) {
        docData['embedding'] = FieldValue.vector([...input.embedding]);
        docData['embeddingModel'] = input.embeddingModel;
        docData['embeddingGeneratedAt'] = now;
      }

      const docRef = collectionRef.doc();
      await docRef.set(docData);

      return entryFromDoc(docRef.id, docData as unknown as KnowledgeEntryDocument);
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

      return snapshot.docs.map((doc) => entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument));
    },

    async getByCategory(category: string): Promise<readonly KnowledgeEntry[]> {
      const snapshot = await collectionRef
        .where('categoryId', '==', category)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument));
    },

    async getUncategorized(): Promise<readonly KnowledgeEntry[]> {
      const snapshot = await collectionRef
        .where('categoryId', '==', '_uncategorized')
        .where('status', '==', 'draft')
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument));
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

      return snapshot.docs.map((doc) => entryFromDoc(doc.id, doc.data() as KnowledgeEntryDocument));
    },

    async searchSimilar(params: {
      domainSchemaId: string;
      embedding: readonly number[];
      limit?: number;
      excludeSessionId?: string;
    }): Promise<readonly KnowledgeSearchResult[]> {
      const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;

      log.info(
        {
          domainSchemaId: params.domainSchemaId,
          embeddingLength: params.embedding.length,
          limit,
          excludeSessionId: params.excludeSessionId,
        },
        'searchSimilar: query parameters',
      );

      try {
        const query = collectionRef.where('domainSchemaId', '==', params.domainSchemaId);

        const snapshot = await query
          .findNearest({
            vectorField: 'embedding',
            queryVector: params.embedding as number[],
            limit,
            distanceMeasure: 'COSINE',
            distanceResultField: '__distance',
          })
          .get();

        log.info(
          { docCount: snapshot.docs.length },
          'searchSimilar: raw findNearest response',
        );

        const results: KnowledgeSearchResult[] = [];

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const distance = data['__distance'] as number | undefined;
          // COSINE distance in Firestore: 0 = identical, 2 = opposite
          // Convert to similarity: 1 - distance
          const score = distance !== undefined ? 1 - distance : 0;

          log.info(
            {
              docId: doc.id,
              distance,
              score,
              sessionId: data['sessionId'],
              belowMinScore: score < MIN_SIMILARITY_SCORE,
              excludedBySession:
                params.excludeSessionId !== undefined &&
                data['sessionId'] === params.excludeSessionId,
            },
            'searchSimilar: candidate document',
          );

          if (score < MIN_SIMILARITY_SCORE) continue;
          if (params.excludeSessionId && data['sessionId'] === params.excludeSessionId) continue;

          results.push({
            entry: entryFromDoc(doc.id, data as unknown as KnowledgeEntryDocument),
            score,
          });
        }

        log.info({ resultCount: results.length }, 'searchSimilar: final results');
        return results;
      } catch (error) {
        log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'searchSimilar: vector search failed',
        );
        return [];
      }
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
