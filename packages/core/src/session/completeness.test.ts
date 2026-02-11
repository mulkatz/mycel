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
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

function createEntry(categoryId: string, structuredData: Record<string, unknown>): KnowledgeEntry {
  const now = new Date();
  return {
    id: 'test-entry',
    categoryId,
    title: 'Test',
    content: 'Test content',
    source: { type: 'text' },
    structuredData,
    tags: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('calculateCompleteness', () => {
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

  it('should return 1.0 for a category with no required fields', () => {
    const entry = createEntry('nature', {});
    expect(calculateCompleteness(entry, domainConfig)).toBe(1.0);
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

  it('should ignore optional fields in the calculation', () => {
    const entry = createEntry('history', { relatedPlaces: 'Village center' });
    expect(calculateCompleteness(entry, domainConfig)).toBe(0);
  });
});
