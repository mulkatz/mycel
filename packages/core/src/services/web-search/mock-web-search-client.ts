import { createChildLogger } from '@mycel/shared/src/logger.js';
import type { WebSearchClient, WebSearchResult } from './types.js';

const log = createChildLogger('web-search:mock');

export interface MockWebSearchResponse {
  readonly content: string;
  readonly sourceUrls: readonly string[];
}

export function createMockWebSearchClient(
  responses?: Map<string, MockWebSearchResponse>,
): WebSearchClient {
  log.info('Using mock web search client');

  const defaultResponse: MockWebSearchResponse = {
    content: 'Mock web search result with general information about the topic.',
    sourceUrls: ['https://example.com/source1', 'https://example.com/source2'],
  };

  return {
    search(query: string): Promise<WebSearchResult> {
      log.debug({ query }, 'Mock web search');

      const response = responses?.get(query) ?? defaultResponse;
      return Promise.resolve({
        query,
        content: response.content,
        sourceUrls: response.sourceUrls,
      });
    },
  };
}
