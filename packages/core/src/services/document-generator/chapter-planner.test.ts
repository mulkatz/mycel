import { describe, it, expect } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import { planChapters } from './chapter-planner.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    { id: 'history', label: 'History & Heritage', description: 'Historical events' },
    { id: 'nature', label: 'Nature & Environment', description: 'Nature things' },
    { id: 'organizations', label: 'Organizations', description: 'Clubs' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

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

describe('planChapters', () => {
  it('should create chapter plans in schema order', () => {
    const grouped = new Map<string, KnowledgeEntry[]>([
      ['history', [makeEntry({ categoryId: 'history' })]],
      ['nature', [makeEntry({ categoryId: 'nature' })]],
    ]);

    const plans = planChapters(domainConfig, grouped);

    expect(plans).toHaveLength(3);
    expect(plans[0].categoryId).toBe('history');
    expect(plans[0].chapterNumber).toBe(1);
    expect(plans[0].filename).toBe('01-history.md');
    expect(plans[0].title).toBe('History & Heritage');
    expect(plans[1].categoryId).toBe('nature');
    expect(plans[1].chapterNumber).toBe(2);
    expect(plans[1].filename).toBe('02-nature.md');
    expect(plans[2].categoryId).toBe('organizations');
    expect(plans[2].chapterNumber).toBe(3);
    expect(plans[2].entries).toHaveLength(0);
  });

  it('should include uncategorized entries as final chapter', () => {
    const grouped = new Map<string, KnowledgeEntry[]>([
      ['_uncategorized', [makeEntry({ categoryId: '_uncategorized' })]],
    ]);

    const plans = planChapters(domainConfig, grouped);

    expect(plans).toHaveLength(4);
    const misc = plans[3];
    expect(misc.categoryId).toBe('_uncategorized');
    expect(misc.title).toBe('Miscellaneous');
    expect(misc.filename).toBe('04-miscellaneous.md');
    expect(misc.entries).toHaveLength(1);
  });

  it('should not add miscellaneous chapter when no uncategorized entries', () => {
    const grouped = new Map<string, KnowledgeEntry[]>();

    const plans = planChapters(domainConfig, grouped);

    expect(plans).toHaveLength(3);
    expect(plans.every((p) => p.categoryId !== '_uncategorized')).toBe(true);
  });

  it('should create empty chapter plans for categories with no entries', () => {
    const grouped = new Map<string, KnowledgeEntry[]>();

    const plans = planChapters(domainConfig, grouped);

    expect(plans).toHaveLength(3);
    for (const plan of plans) {
      expect(plan.entries).toHaveLength(0);
    }
  });
});
