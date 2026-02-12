import type { Firestore } from '@google-cloud/firestore';
import { FieldValue, Timestamp } from '@google-cloud/firestore';
import type { FieldStats } from '@mycel/shared/src/types/evolution.types.js';
import type { FieldStatsRepository } from '../repositories/field-stats.repository.js';

const COLLECTION = 'field-stats';

interface FieldStatsDocument {
  domainSchemaId: string;
  categoryId: string;
  fieldName: string;
  timesAsked?: number;
  timesAnswered?: number;
  lastUpdatedAt: Timestamp;
}

function makeDocId(domainSchemaId: string, categoryId: string, fieldName: string): string {
  return `${domainSchemaId}_${categoryId}_${fieldName}`;
}

function statsFromDoc(data: FieldStatsDocument): FieldStats {
  const timesAsked = data.timesAsked ?? 0;
  const timesAnswered = data.timesAnswered ?? 0;
  return {
    domainSchemaId: data.domainSchemaId,
    categoryId: data.categoryId,
    fieldName: data.fieldName,
    timesAsked,
    timesAnswered,
    answerRate: timesAsked === 0 ? 0 : timesAnswered / timesAsked,
    lastUpdatedAt: data.lastUpdatedAt.toDate(),
  };
}

export function createFirestoreFieldStatsRepository(db: Firestore): FieldStatsRepository {
  const collectionRef = db.collection(COLLECTION);

  return {
    async getByDomain(domainSchemaId: string): Promise<readonly FieldStats[]> {
      const snapshot = await collectionRef
        .where('domainSchemaId', '==', domainSchemaId)
        .get();

      return snapshot.docs.map((doc) => statsFromDoc(doc.data() as FieldStatsDocument));
    },

    async getByCategory(
      domainSchemaId: string,
      categoryId: string,
    ): Promise<readonly FieldStats[]> {
      const snapshot = await collectionRef
        .where('domainSchemaId', '==', domainSchemaId)
        .where('categoryId', '==', categoryId)
        .get();

      return snapshot.docs.map((doc) => statsFromDoc(doc.data() as FieldStatsDocument));
    },

    async incrementAsked(
      domainSchemaId: string,
      categoryId: string,
      fieldName: string,
    ): Promise<void> {
      const docId = makeDocId(domainSchemaId, categoryId, fieldName);
      await collectionRef.doc(docId).set(
        {
          domainSchemaId,
          categoryId,
          fieldName,
          timesAsked: FieldValue.increment(1),
          lastUpdatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    },

    async incrementAnswered(
      domainSchemaId: string,
      categoryId: string,
      fieldName: string,
    ): Promise<void> {
      const docId = makeDocId(domainSchemaId, categoryId, fieldName);
      await collectionRef.doc(docId).set(
        {
          domainSchemaId,
          categoryId,
          fieldName,
          timesAnswered: FieldValue.increment(1),
          lastUpdatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    },
  };
}
