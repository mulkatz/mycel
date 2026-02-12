import { describe, it, expect } from 'vitest';
import type { Category } from '@mycel/schemas/src/domain.schema.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import { analyzeGaps, formatGapHints } from './gap-analyzer.js';

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'entry-1',
    categoryId: 'history',
    title: 'Test',
    content: 'Content',
    source: { type: 'text' },
    structuredData: {},
    tags: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const historyCategory: Category = {
  id: 'history',
  label: 'History & Heritage',
  description: 'Historical events',
  requiredFields: ['period', 'sources'],
  optionalFields: ['relatedPlaces'],
};

describe('analyzeGaps', () => {
  it('should report gap when no entries exist', () => {
    const gaps = analyzeGaps([], historyCategory);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('_entries');
    expect(gaps[0].description).toContain('No entries');
  });

  it('should report missing required fields', () => {
    const entries = [makeEntry({ structuredData: {} })];

    const gaps = analyzeGaps(entries, historyCategory);

    expect(gaps.some((g) => g.field === 'period')).toBe(true);
    expect(gaps.some((g) => g.field === 'sources')).toBe(true);
    expect(gaps.find((g) => g.field === 'period')?.description).toContain('Required');
  });

  it('should report missing optional fields', () => {
    const entries = [makeEntry({ structuredData: { period: '18th century', sources: 'archive' } })];

    const gaps = analyzeGaps(entries, historyCategory);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('relatedPlaces');
    expect(gaps[0].description).toContain('Optional');
  });

  it('should return no gaps when all fields are filled', () => {
    const entries = [
      makeEntry({
        structuredData: {
          period: '18th century',
          sources: 'archive',
          relatedPlaces: 'Main square',
        },
      }),
    ];

    const gaps = analyzeGaps(entries, historyCategory);

    expect(gaps).toHaveLength(0);
  });

  it('should return no gaps for uncategorized entries (no category schema)', () => {
    const entries = [makeEntry({ categoryId: '_uncategorized' })];

    const gaps = analyzeGaps(entries, undefined);

    expect(gaps).toHaveLength(0);
  });

  it('should consider field present if any entry has it', () => {
    const entries = [
      makeEntry({ structuredData: { period: '18th century' } }),
      makeEntry({ structuredData: { sources: 'archive' } }),
    ];

    const gaps = analyzeGaps(entries, historyCategory);

    // Only relatedPlaces should be missing
    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('relatedPlaces');
  });
});

describe('formatGapHints', () => {
  it('should return empty string when no gaps', () => {
    expect(formatGapHints([])).toBe('');
  });

  it('should format gap hints as italicized list', () => {
    const result = formatGapHints([
      { field: 'period', description: 'Required field "period" is missing.' },
    ]);

    expect(result).toContain("What's still missing");
    expect(result).toContain('*Required field "period" is missing.*');
  });
});
