import { describe, it, expect } from 'vitest';
import { createMockWebSearchClient } from './mock-web-search-client.js';
import type { MockWebSearchResponse } from './mock-web-search-client.js';

describe('MockWebSearchClient', () => {
  it('should return default response for unknown queries', async () => {
    const client = createMockWebSearchClient();
    const result = await client.search('test query');

    expect(result.query).toBe('test query');
    expect(result.content).toContain('Mock web search result');
    expect(result.sourceUrls.length).toBeGreaterThan(0);
  });

  it('should return configured response for known queries', async () => {
    const responses = new Map<string, MockWebSearchResponse>();
    responses.set('specific query', {
      content: 'Specific result',
      sourceUrls: ['https://specific.example.com'],
    });

    const client = createMockWebSearchClient(responses);
    const result = await client.search('specific query');

    expect(result.content).toBe('Specific result');
    expect(result.sourceUrls).toEqual(['https://specific.example.com']);
  });

  it('should include the query in the result', async () => {
    const client = createMockWebSearchClient();
    const result = await client.search('my search query');

    expect(result.query).toBe('my search query');
  });

  it('should return default response for unconfigured queries when responses provided', async () => {
    const responses = new Map<string, MockWebSearchResponse>();
    responses.set('configured', {
      content: 'Configured',
      sourceUrls: [],
    });

    const client = createMockWebSearchClient(responses);
    const result = await client.search('unconfigured');

    expect(result.content).toContain('Mock web search result');
  });
});
