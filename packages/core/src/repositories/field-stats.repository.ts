import type { FieldStats } from '@mycel/shared/src/types/evolution.types.js';

export interface FieldStatsRepository {
  getByDomain(domainSchemaId: string): Promise<readonly FieldStats[]>;
  getByCategory(domainSchemaId: string, categoryId: string): Promise<readonly FieldStats[]>;
  incrementAsked(domainSchemaId: string, categoryId: string, fieldName: string): Promise<void>;
  incrementAnswered(domainSchemaId: string, categoryId: string, fieldName: string): Promise<void>;
}
