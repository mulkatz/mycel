import { describe, it, expect, vi } from 'vitest';
import type { LlmClient } from '../../llm/llm-client.js';
import { analyzeDomain, DomainAnalysisSchema } from './domain-analyzer.js';

function createMockLlm(response: Record<string, unknown>): LlmClient {
  return {
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
    }),
  };
}

const validAnalysis = {
  domainType: 'local community',
  subject: 'Village of Naugarten',
  location: 'Brandenburg, Germany',
  language: 'de',
  intent: 'document community knowledge',
  searchQueries: [
    'Naugarten Brandenburg Geschichte',
    'Dorfgemeinschaft Wissensmanagement Kategorien',
    'lokale Naturschutzgebiete Brandenburg',
    'Vereine und Organisationen ländlicher Raum',
    'lokales Brauchtum Brandenburg Uckermark',
  ],
};

describe('analyzeDomain', () => {
  it('should analyze a domain description and return structured analysis', async () => {
    const llm = createMockLlm(validAnalysis);
    const result = await analyzeDomain('A village website for Naugarten, Brandenburg', llm);

    expect(result.domainType).toBe('local community');
    expect(result.subject).toBe('Village of Naugarten');
    expect(result.language).toBe('de');
    expect(result.searchQueries.length).toBeGreaterThanOrEqual(3);
  });

  it('should pass description and language hint to LLM', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify(validAnalysis),
    });
    const llm: LlmClient = { invoke: invokeFn };
    await analyzeDomain('Test description', llm, 'de');

    expect(invokeFn).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const request = invokeFn.mock.calls[0][0] as Record<string, string>;
    expect(request['userMessage']).toContain('Test description');
    expect(request['userMessage']).toContain('Language hint: de');
  });

  it('should handle LLM returning null for location', async () => {
    const llm = createMockLlm({ ...validAnalysis, location: null });
    const result = await analyzeDomain('A knowledge base about cooking techniques', llm);

    expect(result.subject).toBe('Village of Naugarten');
    expect(result.location).toBeNull();
  });

  it('should not include language hint when not provided', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify(validAnalysis),
    });
    const llm: LlmClient = { invoke: invokeFn };
    await analyzeDomain('Test description', llm);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const request = invokeFn.mock.calls[0][0] as Record<string, string>;
    expect(request['userMessage']).not.toContain('Language hint');
  });
});

describe('DomainAnalysisSchema', () => {
  it('should validate a correct analysis', () => {
    const result = DomainAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it('should reject analysis with too few search queries', () => {
    const result = DomainAnalysisSchema.safeParse({
      ...validAnalysis,
      searchQueries: ['only one'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject analysis with empty subject', () => {
    const result = DomainAnalysisSchema.safeParse({
      ...validAnalysis,
      subject: '',
    });
    expect(result.success).toBe(false);
  });

  it('should allow optional location', () => {
    const withoutLocation = { ...validAnalysis };
    delete (withoutLocation as Record<string, unknown>)['location'];
    const result = DomainAnalysisSchema.safeParse(withoutLocation);
    expect(result.success).toBe(true);
  });

  it('should allow null location (LLM may return null for optional fields)', () => {
    const result = DomainAnalysisSchema.safeParse({
      ...validAnalysis,
      location: null,
    });
    expect(result.success).toBe(true);
  });
});
