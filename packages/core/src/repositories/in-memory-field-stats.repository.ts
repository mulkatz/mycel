import type { FieldStats } from '@mycel/shared/src/types/evolution.types.js';
import type { FieldStatsRepository } from './field-stats.repository.js';

function makeKey(domainSchemaId: string, categoryId: string, fieldName: string): string {
  return `${domainSchemaId}_${categoryId}_${fieldName}`;
}

interface MutableFieldStats {
  domainSchemaId: string;
  categoryId: string;
  fieldName: string;
  timesAsked: number;
  timesAnswered: number;
  lastUpdatedAt: Date;
}

export function createInMemoryFieldStatsRepository(): FieldStatsRepository {
  const stats = new Map<string, MutableFieldStats>();

  function getOrCreate(
    domainSchemaId: string,
    categoryId: string,
    fieldName: string,
  ): MutableFieldStats {
    const key = makeKey(domainSchemaId, categoryId, fieldName);
    let entry = stats.get(key);
    if (!entry) {
      entry = {
        domainSchemaId,
        categoryId,
        fieldName,
        timesAsked: 0,
        timesAnswered: 0,
        lastUpdatedAt: new Date(),
      };
      stats.set(key, entry);
    }
    return entry;
  }

  function toFieldStats(s: MutableFieldStats): FieldStats {
    return {
      domainSchemaId: s.domainSchemaId,
      categoryId: s.categoryId,
      fieldName: s.fieldName,
      timesAsked: s.timesAsked,
      timesAnswered: s.timesAnswered,
      answerRate: s.timesAsked === 0 ? 0 : s.timesAnswered / s.timesAsked,
      lastUpdatedAt: s.lastUpdatedAt,
    };
  }

  return {
    getByDomain(domainSchemaId: string): Promise<readonly FieldStats[]> {
      const result = [...stats.values()]
        .filter((s) => s.domainSchemaId === domainSchemaId)
        .map(toFieldStats);
      return Promise.resolve(result);
    },

    getByCategory(domainSchemaId: string, categoryId: string): Promise<readonly FieldStats[]> {
      const result = [...stats.values()]
        .filter((s) => s.domainSchemaId === domainSchemaId && s.categoryId === categoryId)
        .map(toFieldStats);
      return Promise.resolve(result);
    },

    incrementAsked(
      domainSchemaId: string,
      categoryId: string,
      fieldName: string,
    ): Promise<void> {
      const entry = getOrCreate(domainSchemaId, categoryId, fieldName);
      entry.timesAsked += 1;
      entry.lastUpdatedAt = new Date();
      return Promise.resolve();
    },

    incrementAnswered(
      domainSchemaId: string,
      categoryId: string,
      fieldName: string,
    ): Promise<void> {
      const entry = getOrCreate(domainSchemaId, categoryId, fieldName);
      entry.timesAnswered += 1;
      entry.lastUpdatedAt = new Date();
      return Promise.resolve();
    },
  };
}
