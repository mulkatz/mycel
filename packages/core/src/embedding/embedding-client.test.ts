import { describe, it, expect } from 'vitest';
import { createMockEmbeddingClient } from './mock-embedding-client.js';
import { EMBEDDING_DIMENSION } from './embedding-client.js';
import { buildEmbeddingText, buildInputEmbeddingText } from './embedding-text-builder.js';

describe('MockEmbeddingClient', () => {
  it('should generate embedding with correct dimensions', async () => {
    const client = createMockEmbeddingClient();
    const embedding = await client.generateEmbedding('test input');

    expect(embedding).toHaveLength(EMBEDDING_DIMENSION);
  });

  it('should generate deterministic embeddings for same input', async () => {
    const client = createMockEmbeddingClient();
    const e1 = await client.generateEmbedding('test input');
    const e2 = await client.generateEmbedding('test input');

    expect(e1).toEqual(e2);
  });

  it('should generate different embeddings for different inputs', async () => {
    const client = createMockEmbeddingClient();
    const e1 = await client.generateEmbedding('church');
    const e2 = await client.generateEmbedding('river');

    expect(e1).not.toEqual(e2);
  });

  it('should generate batch embeddings with correct count', async () => {
    const client = createMockEmbeddingClient();
    const results = await client.generateEmbeddings(['a', 'b', 'c']);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).toHaveLength(EMBEDDING_DIMENSION);
    }
  });

  it('should generate normalized unit vectors', async () => {
    const client = createMockEmbeddingClient();
    const embedding = await client.generateEmbedding('test');

    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });
});

describe('buildEmbeddingText', () => {
  it('should combine category, title, content, structured data, and tags', () => {
    const text = buildEmbeddingText({
      categoryId: 'history',
      title: 'Village Church',
      content: 'The church was built in 1732.',
      structuredData: { period: '18th century', sources: 'Church records' },
      tags: ['history', 'architecture'],
    });

    expect(text).toContain('history');
    expect(text).toContain('Village Church');
    expect(text).toContain('The church was built in 1732.');
    expect(text).toContain('period: 18th century');
    expect(text).toContain('sources: Church records');
    expect(text).toContain('history, architecture');
  });

  it('should exclude _uncategorized from text', () => {
    const text = buildEmbeddingText({
      categoryId: '_uncategorized',
      title: 'Some Memory',
      content: 'A memory.',
      structuredData: {},
      tags: [],
    });

    expect(text).not.toContain('_uncategorized');
    expect(text).toContain('Some Memory');
  });

  it('should handle empty structured data and tags', () => {
    const text = buildEmbeddingText({
      categoryId: 'nature',
      title: 'Forest',
      content: 'A beautiful forest.',
      structuredData: {},
      tags: [],
    });

    expect(text).toBe('nature. Forest. A beautiful forest.');
  });
});

describe('buildInputEmbeddingText', () => {
  it('should prepend category to input when categorized', () => {
    const text = buildInputEmbeddingText('The church was built in 1732', 'history');
    expect(text).toBe('history. The church was built in 1732');
  });

  it('should return raw input for uncategorized', () => {
    const text = buildInputEmbeddingText('Something random', '_uncategorized');
    expect(text).toBe('Something random');
  });

  it('should return raw input when no category provided', () => {
    const text = buildInputEmbeddingText('Something random');
    expect(text).toBe('Something random');
  });
});
