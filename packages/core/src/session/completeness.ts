import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';

export function calculateCompleteness(entry: KnowledgeEntry, domainConfig: DomainConfig): number {
  const category = domainConfig.categories.find((c) => c.id === entry.categoryId);
  if (!category) {
    return 0;
  }

  const requiredFields = category.requiredFields ?? [];
  if (requiredFields.length === 0) {
    return 1.0;
  }

  const filledCount = requiredFields.filter(
    (field) =>
      entry.structuredData[field] !== undefined &&
      entry.structuredData[field] !== null &&
      entry.structuredData[field] !== '',
  ).length;

  return filledCount / requiredFields.length;
}
