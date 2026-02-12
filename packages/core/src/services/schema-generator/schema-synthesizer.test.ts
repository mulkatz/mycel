import { describe, it, expect, vi } from 'vitest';
import type { LlmClient } from '../../llm/llm-client.js';
import type { DomainAnalysis } from './types.js';
import type { WebSearchResult } from '../web-search/types.js';
import { synthesizeSchema } from './schema-synthesizer.js';

const analysis: DomainAnalysis = {
  domainType: 'local community',
  subject: 'Village of Naugarten',
  location: 'Brandenburg',
  language: 'de',
  intent: 'document community knowledge',
  searchQueries: ['query1'],
};

const searchResults: WebSearchResult[] = [
  {
    query: 'Naugarten Geschichte',
    content: 'Historical information about Naugarten village.',
    sourceUrls: ['https://example.com/history'],
  },
  {
    query: 'Naugarten Vereine',
    content: 'Information about local organizations.',
    sourceUrls: ['https://example.com/orgs'],
  },
];

const validSchema = {
  name: 'village-naugarten',
  version: '1.0.0',
  description: 'Knowledge base for the village of Naugarten',
  categories: [
    {
      id: 'history',
      label: 'Geschichte',
      description: 'Historische Ereignisse und Traditionen',
      requiredFields: ['period', 'sources'],
      optionalFields: ['relatedPlaces'],
      origin: 'web_research',
      sourceUrls: ['https://example.com/history'],
    },
    {
      id: 'organizations',
      label: 'Vereine',
      description: 'Lokale Vereine und Organisationen',
      requiredFields: ['name', 'type'],
      origin: 'web_research',
      sourceUrls: ['https://example.com/orgs'],
    },
  ],
  ingestion: {
    allowedModalities: ['text', 'audio', 'image'],
    primaryLanguage: 'de',
    supportedLanguages: ['de', 'en'],
  },
};

describe('synthesizeSchema', () => {
  it('should synthesize a schema from analysis and search results', async () => {
    const llm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(validSchema) }),
    };
    const result = await synthesizeSchema(analysis, searchResults, llm);

    expect(result.name).toBe('village-naugarten');
    expect(result.categories.length).toBe(2);
    expect(result.categories[0].id).toBe('history');
    expect(result.ingestion.primaryLanguage).toBe('de');
  });

  it('should pass search results to the LLM prompt', async () => {
    const invokeFn = vi.fn().mockResolvedValue({ content: JSON.stringify(validSchema) });
    const llm: LlmClient = { invoke: invokeFn };
    await synthesizeSchema(analysis, searchResults, llm);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const request = invokeFn.mock.calls[0][0] as Record<string, string>;
    expect(request['userMessage']).toContain('Naugarten Geschichte');
    expect(request['userMessage']).toContain('Historical information');
  });

  it('should include hybrid mode instructions when partial schema provided', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        ...validSchema,
        categories: [
          { id: 'existing-cat', label: 'Existing', description: 'Pre-existing category' },
          ...validSchema.categories,
        ],
      }),
    });
    const llm: LlmClient = { invoke: invokeFn };

    const partialSchema = {
      categories: [
        { id: 'existing-cat', label: 'Existing', description: 'Pre-existing category' },
      ],
    };

    await synthesizeSchema(analysis, searchResults, llm, partialSchema);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const request = invokeFn.mock.calls[0][0] as Record<string, string>;
    expect(request['systemPrompt']).toContain('Hybrid Mode');
    expect(request['systemPrompt']).toContain('existing-cat');
    expect(request['userMessage']).toContain('Existing Partial Schema');
  });

  it('should not include hybrid instructions without partial schema', async () => {
    const invokeFn = vi.fn().mockResolvedValue({ content: JSON.stringify(validSchema) });
    const llm: LlmClient = { invoke: invokeFn };
    await synthesizeSchema(analysis, searchResults, llm);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const request = invokeFn.mock.calls[0][0] as Record<string, string>;
    expect(request['systemPrompt']).not.toContain('Hybrid Mode');
  });
});
