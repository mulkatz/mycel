import type { Category } from '@mycel/schemas/src/domain.schema.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { GapHint } from './types.js';

export function analyzeGaps(
  entries: readonly KnowledgeEntry[],
  category: Category | undefined,
): readonly GapHint[] {
  const gaps: GapHint[] = [];

  if (entries.length === 0) {
    gaps.push({
      field: '_entries',
      description: 'No entries have been collected for this topic yet.',
    });
    return gaps;
  }

  if (!category) {
    // Uncategorized entries — no schema fields to check
    return gaps;
  }

  const requiredFields = category.requiredFields ?? [];
  const optionalFields = category.optionalFields ?? [];
  const allFields = [...requiredFields, ...optionalFields];

  for (const field of allFields) {
    const entriesWithField = entries.filter((e) => {
      const value = e.structuredData[field];
      return value !== undefined && value !== null && value !== '';
    });

    if (entriesWithField.length === 0) {
      const isRequired = requiredFields.includes(field);
      gaps.push({
        field,
        description: isRequired
          ? `Required field "${field}" is missing from all entries.`
          : `Optional field "${field}" has not been captured in any entry.`,
      });
    }
  }

  return gaps;
}

export function formatGapHints(gaps: readonly GapHint[]): string {
  if (gaps.length === 0) {
    return '';
  }

  const lines = [
    '',
    '---',
    '',
    '*What\'s still missing:*',
    '',
  ];

  for (const gap of gaps) {
    lines.push(`- *${gap.description}*`);
  }

  lines.push('');

  return lines.join('\n');
}
