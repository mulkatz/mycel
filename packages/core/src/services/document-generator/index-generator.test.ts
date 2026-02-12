import { describe, it, expect } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { ChapterResult, DocumentMeta } from './types.js';
import { generateIndex } from './index-generator.js';

const domainConfig: DomainConfig = {
  name: 'community-knowledge',
  version: '1.0.0',
  description: 'Knowledge base for a local community',
  categories: [
    { id: 'history', label: 'History & Heritage', description: 'Historical events' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

const meta: DocumentMeta = {
  generatedAt: '2025-02-12T15:30:00Z',
  domainSchemaId: 'community-knowledge',
  contentLanguage: 'de',
  totalEntries: 5,
  totalChapters: 2,
  chaptersWithContent: 1,
  chaptersEmpty: 1,
  gapsIdentified: 3,
  sourceEntryIds: ['e1', 'e2', 'e3', 'e4', 'e5'],
  generationDurationMs: 5000,
};

const chapters: ChapterResult[] = [
  {
    filename: '01-history.md',
    title: 'History & Heritage',
    content: '# History\n\nSome content.',
    entryCount: 3,
    gapCount: 2,
    gaps: [],
  },
  {
    filename: '02-nature.md',
    title: 'Nature & Environment',
    content: '# Nature\n\nNo information yet.',
    entryCount: 0,
    gapCount: 1,
    gaps: [],
  },
];

describe('generateIndex', () => {
  it('should include domain name and description', () => {
    const result = generateIndex(domainConfig, chapters, meta);

    expect(result).toContain('# community-knowledge');
    expect(result).toContain('Knowledge base for a local community');
  });

  it('should include table of contents with links', () => {
    const result = generateIndex(domainConfig, chapters, meta);

    expect(result).toContain('[History & Heritage](./01-history.md)');
    expect(result).toContain('[Nature & Environment](./02-nature.md)');
  });

  it('should show entry count for chapters with content', () => {
    const result = generateIndex(domainConfig, chapters, meta);

    expect(result).toContain('(3 entries)');
    expect(result).toContain('(empty)');
  });

  it('should include statistics', () => {
    const result = generateIndex(domainConfig, chapters, meta);

    expect(result).toContain('**Total entries:** 5');
    expect(result).toContain('**Chapters:** 2');
    expect(result).toContain('**Gaps identified:** 3');
    expect(result).toContain('**Content language:** de');
  });

  it('should include generation timestamp', () => {
    const result = generateIndex(domainConfig, chapters, meta);

    expect(result).toContain('2025-02-12T15:30:00Z');
  });
});
