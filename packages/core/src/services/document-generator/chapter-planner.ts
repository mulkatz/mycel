import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { ChapterPlan } from './types.js';

export function planChapters(
  domainConfig: DomainConfig,
  groupedEntries: Map<string, KnowledgeEntry[]>,
): readonly ChapterPlan[] {
  const plans: ChapterPlan[] = [];
  let chapterNumber = 1;

  for (const category of domainConfig.categories) {
    const entries = groupedEntries.get(category.id) ?? [];
    const paddedNumber = String(chapterNumber).padStart(2, '0');

    plans.push({
      chapterNumber,
      categoryId: category.id,
      title: category.label,
      filename: `${paddedNumber}-${category.id}.md`,
      entries,
    });

    chapterNumber++;
  }

  // Add uncategorized entries as final "Miscellaneous" chapter if any exist
  const uncategorized = groupedEntries.get('_uncategorized');
  if (uncategorized && uncategorized.length > 0) {
    const paddedNumber = String(chapterNumber).padStart(2, '0');

    plans.push({
      chapterNumber,
      categoryId: '_uncategorized',
      title: 'Miscellaneous',
      filename: `${paddedNumber}-miscellaneous.md`,
      entries: uncategorized,
    });
  }

  return plans;
}
