import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { ChapterResult, DocumentMeta } from './types.js';

export function generateIndex(
  domainConfig: DomainConfig,
  chapters: readonly ChapterResult[],
  meta: DocumentMeta,
): string {
  const lines: string[] = [];

  lines.push(`# ${domainConfig.name}`);
  lines.push('');
  lines.push(domainConfig.description);
  lines.push('');

  // Table of contents
  lines.push('## Table of Contents');
  lines.push('');

  for (const chapter of chapters) {
    const entryInfo = chapter.entryCount > 0
      ? ` (${String(chapter.entryCount)} ${chapter.entryCount === 1 ? 'entry' : 'entries'})`
      : ' (empty)';
    lines.push(`- [${chapter.title}](./${chapter.filename})${entryInfo}`);
  }

  lines.push('');

  // Statistics
  lines.push('## Statistics');
  lines.push('');
  lines.push(`- **Total entries:** ${String(meta.totalEntries)}`);
  lines.push(`- **Chapters:** ${String(meta.totalChapters)}`);
  lines.push(`- **Chapters with content:** ${String(meta.chaptersWithContent)}`);
  lines.push(`- **Empty chapters:** ${String(meta.chaptersEmpty)}`);
  lines.push(`- **Gaps identified:** ${String(meta.gapsIdentified)}`);
  lines.push(`- **Content language:** ${meta.contentLanguage}`);
  lines.push('');

  // Generation info
  lines.push('---');
  lines.push('');
  lines.push(`*Generated on ${meta.generatedAt}*`);
  lines.push('');

  return lines.join('\n');
}
