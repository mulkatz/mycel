import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';

export function calculateCompleteness(
  entry: KnowledgeEntry | undefined,
  domainConfig: DomainConfig,
): number {
  if (!entry) {
    return 0;
  }

  if (entry.categoryId === '_uncategorized') {
    const hasLabel = entry.structuredData['suggestedCategoryLabel'] !== undefined;
    const hasKeywords =
      Array.isArray(entry.structuredData['topicKeywords']) &&
      (entry.structuredData['topicKeywords'] as unknown[]).length > 0;
    const hasContent = entry.content.length > 0;
    const filled = [hasLabel, hasKeywords, hasContent].filter(Boolean).length;
    // Max 30% for uncategorized — we don't know what fields matter yet
    return (filled / 3) * 0.3;
  }

  const category = domainConfig.categories.find((c) => c.id === entry.categoryId);
  if (!category) {
    return 0;
  }

  const requiredFields = category.requiredFields ?? [];
  const optionalFields = category.optionalFields ?? [];

  if (requiredFields.length === 0 && optionalFields.length === 0) {
    // No schema fields at all — base on content richness
    return entry.content.length > 50 ? 0.5 : 0.3;
  }

  if (requiredFields.length === 0) {
    // Only optional fields — use them but cap at 80%
    const filledCount = optionalFields.filter(
      (field) =>
        entry.structuredData[field] !== undefined &&
        entry.structuredData[field] !== null &&
        entry.structuredData[field] !== '',
    ).length;
    return Math.min((filledCount / optionalFields.length) * 0.8, 0.8);
  }

  // Normal: required fields determine completeness
  const filledCount = requiredFields.filter(
    (field) =>
      entry.structuredData[field] !== undefined &&
      entry.structuredData[field] !== null &&
      entry.structuredData[field] !== '',
  ).length;

  return filledCount / requiredFields.length;
}
