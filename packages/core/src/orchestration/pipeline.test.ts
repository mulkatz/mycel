import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { AgentInput } from '@mycel/shared/src/types/agent.types.js';
import { createPipeline } from './pipeline.js';

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
    { id: 'nature', label: 'Nature', description: 'Natural environment' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

const personaConfig: PersonaConfig = {
  name: 'Test Chronicler',
  version: '1.0.0',
  tonality: 'warm',
  formality: 'informal',
  language: 'en',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: false,
    validateWithSources: true,
  },
  systemPromptTemplate: 'You are a test chronicler.',
};

function createMockLlm(): { client: LlmClient; callCount: () => number } {
  let calls = 0;
  const invokeFn = vi
    .fn()
    .mockImplementation((request: { systemPrompt: string; userMessage: string }) => {
      const prompt = request.systemPrompt.toLowerCase();

      if (prompt.includes('classifier')) {
        return {
          content: JSON.stringify({
            categoryId: 'history',
            confidence: 0.9,
            reasoning: 'Historical content',
          }),
        };
      }

      if (prompt.includes('gap-reasoning') || prompt.includes('gap analysis')) {
        return {
          content: JSON.stringify({
            gaps: [{ field: 'period', description: 'Period unclear', priority: 'high' }],
            followUpQuestions: ['When was this exactly?'],
            reasoning: 'Missing required fields.',
          }),
        };
      }

      if (prompt.includes('persona')) {
        return {
          content: JSON.stringify({
            response: 'Thanks for sharing! Tell me more.',
            followUpQuestions: ['When did this happen?'],
          }),
        };
      }

      if (prompt.includes('structuring')) {
        return {
          content: JSON.stringify({
            title: 'Historic Church',
            content: 'A church built in 1732.',
            structuredData: { year: 1732 },
            tags: ['history'],
            isComplete: false,
            missingFields: ['period', 'sources'],
          }),
        };
      }

      return { content: JSON.stringify({ result: 'unknown' }) };
    });
  const wrappedInvoke: LlmClient['invoke'] = (request) => {
    calls++;
    return invokeFn(request) as Promise<{ content: string }>;
  };
  return { client: { invoke: wrappedInvoke }, callCount: () => calls };
}

describe('createPipeline', () => {
  it('should run the full pipeline and return all agent outputs', async () => {
    const { client } = createMockLlm();
    const pipeline = createPipeline({
      domainConfig,
      personaConfig,
      llmClient: client,
    });

    const input: AgentInput = {
      sessionId: 'integration-test',
      content: 'The old church was built in 1732 by local craftsmen.',
      metadata: { source: 'test' },
    };

    const result = await pipeline.run(input);

    expect(result.sessionId).toBe('integration-test');
    expect(result.input).toEqual(input);

    expect(result.classifierOutput).toBeDefined();
    expect(result.classifierOutput?.result.categoryId).toBe('history');

    expect(result.contextDispatcherOutput).toBeDefined();
    expect(result.contextDispatcherOutput?.result.relevantContext).toEqual([]);

    expect(result.gapReasoningOutput).toBeDefined();
    expect(result.gapReasoningOutput?.result.gaps.length).toBeGreaterThan(0);

    expect(result.personaOutput).toBeDefined();
    expect(result.personaOutput?.result.response).toBeTruthy();

    expect(result.structuringOutput).toBeDefined();
    expect(result.structuringOutput?.result.entry.id).toBeTruthy();
    expect(result.structuringOutput?.result.entry.categoryId).toBe('history');
  });

  it('should call LLM for classifier, gap-reasoning, persona, and structuring', async () => {
    const { client, callCount } = createMockLlm();
    const pipeline = createPipeline({
      domainConfig,
      personaConfig,
      llmClient: client,
    });

    const input: AgentInput = {
      sessionId: 'test-calls',
      content: 'Test input text',
      metadata: {},
    };

    await pipeline.run(input);

    // 4 LLM calls: classifier, gap-reasoning, persona, structuring
    // (context-dispatcher is a stub and doesn't call LLM)
    expect(callCount()).toBe(4);
  });
});
