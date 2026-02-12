import { describe, it, expect } from 'vitest';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { calculateCompleteness } from './completeness.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical events',
      requiredFields: ['period', 'sources'],
      optionalFields: ['relatedPlaces'],
    },
    {
      id: 'nature',
      label: 'Nature',
      description: 'Natural environment',
    },
    {
      id: 'organizations',
      label: 'Organizations',
      description: 'Clubs and groups',
      optionalFields: ['members', 'founded', 'activities'],
    },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

function createEntry(
  categoryId: string,
  structuredData: Record<string, unknown>,
  content?: string,
): KnowledgeEntry {
  const now = new Date();
  return {
    id: 'test-entry',
    categoryId,
    title: 'Test',
    content: content ?? 'Test content',
    source: { type: 'text' },
    structuredData,
    tags: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('calculateCompleteness', () => {
  it('should return 0 when entry is undefined', () => {
    expect(calculateCompleteness(undefined, domainConfig)).toBe(0);
  });

  it('should return 0 when no required fields are filled', () => {
    const entry = createEntry('history', {});
    expect(calculateCompleteness(entry, domainConfig)).toBe(0);
  });

  it('should return 0.5 when half the required fields are filled', () => {
    const entry = createEntry('history', { period: '18th century' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0.5);
  });

  it('should return 1.0 when all required fields are filled', () => {
    const entry = createEntry('history', { period: '18th century', sources: 'Church records' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(1.0);
  });

  it('should return 0.3-0.5 for a category with no required or optional fields', () => {
    // nature has no requiredFields and no optionalFields
    const shortEntry = createEntry('nature', {}, 'Short');
    expect(calculateCompleteness(shortEntry, domainConfig)).toBe(0.3);

    const longEntry = createEntry(
      'nature',
      {},
      'A detailed description of the local nature that has more than 50 characters of content',
    );
    expect(calculateCompleteness(longEntry, domainConfig)).toBe(0.5);
  });

  it('should return 0 for a nonexistent category', () => {
    const entry = createEntry('nonexistent', { period: 'value' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0);
  });

  it('should treat empty string as missing', () => {
    const entry = createEntry('history', { period: '', sources: 'Church records' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0.5);
  });

  it('should treat null as missing', () => {
    const entry = createEntry('history', { period: null, sources: 'Church records' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0.5);
  });

  it('should treat undefined as missing', () => {
    const entry = createEntry('history', { period: undefined, sources: 'Church records' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0.5);
  });

  it('should ignore optional fields in calculation for categories with required fields', () => {
    const entry = createEntry('history', { relatedPlaces: 'Village center' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0);
  });

  it('should return low score (≤0.3) for _uncategorized entries', () => {
    const entry = createEntry('_uncategorized', {
      suggestedCategoryLabel: 'Childhood Memories',
      topicKeywords: ['childhood', 'summer'],
    });
    // 3/3 filled * 0.3 = 0.3
    expect(calculateCompleteness(entry, domainConfig)).toBeCloseTo(0.3);
  });

  it('should return partial low score for _uncategorized entry missing metadata', () => {
    const entry = createEntry('_uncategorized', {});
    // Has content (from createEntry) but no suggestedCategoryLabel or topicKeywords
    // 1/3 * 0.3 = 0.1
    expect(calculateCompleteness(entry, domainConfig)).toBeCloseTo(0.1);
  });

  it('should count empty topicKeywords array as missing', () => {
    const entry = createEntry('_uncategorized', {
      suggestedCategoryLabel: 'Fishing',
      topicKeywords: [],
    });
    // Has content + suggestedCategoryLabel but no topicKeywords
    // 2/3 * 0.3 = 0.2
    expect(calculateCompleteness(entry, domainConfig)).toBeCloseTo(0.2);
  });

  it('should use optional fields capped at 80% for categories with only optional fields', () => {
    // organizations has only optional fields: members, founded, activities
    const entryNone = createEntry('organizations', {});
    expect(calculateCompleteness(entryNone, domainConfig)).toBe(0);

    const entryOne = createEntry('organizations', { members: '20 people' });
    // 1/3 * 0.8 ≈ 0.267
    expect(calculateCompleteness(entryOne, domainConfig)).toBeCloseTo(0.267, 2);

    const entryAll = createEntry('organizations', {
      members: '20',
      founded: '1995',
      activities: 'sports',
    });
    // 3/3 * 0.8 = 0.8
    expect(calculateCompleteness(entryAll, domainConfig)).toBe(0.8);
  });
});
