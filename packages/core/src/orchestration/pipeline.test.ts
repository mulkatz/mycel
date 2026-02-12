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
            intent: 'content',
            isTopicChange: false,
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
            response: '1732, wow! When was this exactly?',
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

function createUncategorizedMockLlm(): { client: LlmClient; callCount: () => number } {
  let calls = 0;
  const invokeFn = vi
    .fn()
    .mockImplementation((request: { systemPrompt: string; userMessage: string }) => {
      const prompt = request.systemPrompt.toLowerCase();

      // Check specific agents before classifier because uncategorized prompts for
      // gap-reasoning and structuring contain "Classifier summary:" which would
      // incorrectly match the classifier branch.
      if (prompt.includes('gap-reasoning') || prompt.includes('gap analysis')) {
        return {
          content: JSON.stringify({
            gaps: [
              { field: 'timeframe', description: 'When did this happen?', priority: 'medium' },
            ],
            followUpQuestions: [
              'When did this happen?',
              'Where exactly was this?',
              'Is this something that happens regularly?',
            ],
            reasoning: 'Exploratory questions for uncategorized input.',
          }),
        };
      }

      if (prompt.includes('your persona')) {
        return {
          content: JSON.stringify({
            response: 'What lovely memories! When did this happen?',
            followUpQuestions: ['When did this happen?', 'Where exactly was this?'],
          }),
        };
      }

      if (prompt.includes('structuring')) {
        return {
          content: JSON.stringify({
            title: 'Summer Memories',
            content: 'A personal account of childhood summers.',
            structuredData: {
              suggestedCategoryLabel: 'Childhood Memories',
              topicKeywords: ['childhood', 'summer', 'village'],
            },
            tags: ['personal', 'memories'],
            isComplete: false,
            missingFields: ['timeframe', 'location'],
          }),
        };
      }

      if (prompt.includes('classifier')) {
        return {
          content: JSON.stringify({
            categoryId: '_uncategorized',
            confidence: 0.3,
            intent: 'content',
            isTopicChange: false,
            reasoning: 'Does not fit existing categories.',
            summary: 'Personal childhood memory about summers',
            suggestedCategoryLabel: 'Childhood Memories',
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

function createGreetingMockLlm(): { client: LlmClient; callCount: () => number } {
  let calls = 0;
  const invokeFn = vi
    .fn()
    .mockImplementation((request: { systemPrompt: string; userMessage: string }) => {
      const prompt = request.systemPrompt.toLowerCase();

      if (prompt.includes('classifier')) {
        return {
          content: JSON.stringify({
            categoryId: '_meta',
            confidence: 1.0,
            intent: 'greeting',
            isTopicChange: false,
            reasoning: 'User is greeting.',
          }),
        };
      }

      if (prompt.includes('persona')) {
        return {
          content: JSON.stringify({
            response: 'Hey! What would you like to tell me about?',
            followUpQuestions: [],
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

  it('should run full pipeline for _uncategorized input without errors', async () => {
    const { client } = createUncategorizedMockLlm();
    const pipeline = createPipeline({
      domainConfig,
      personaConfig,
      llmClient: client,
    });

    const input: AgentInput = {
      sessionId: 'uncategorized-test',
      content: 'I remember the summers here were always so beautiful as a child',
      metadata: {},
    };

    const result = await pipeline.run(input);

    expect(result.sessionId).toBe('uncategorized-test');

    expect(result.classifierOutput).toBeDefined();
    expect(result.classifierOutput?.result.categoryId).toBe('_uncategorized');
    expect(result.classifierOutput?.result.summary).toBeTruthy();
    expect(result.classifierOutput?.result.suggestedCategoryLabel).toBe('Childhood Memories');

    expect(result.gapReasoningOutput).toBeDefined();
    expect(result.gapReasoningOutput?.result.followUpQuestions.length).toBeGreaterThan(0);

    expect(result.personaOutput).toBeDefined();
    expect(result.personaOutput?.result.response).toBeTruthy();

    expect(result.structuringOutput).toBeDefined();
    const entry = result.structuringOutput?.result.entry;
    expect(entry?.categoryId).toBe('_uncategorized');
    expect(entry?.structuredData).toHaveProperty('suggestedCategoryLabel');
    expect(entry?.structuredData).toHaveProperty('topicKeywords');
    expect(entry?.id).toBeTruthy();
  });

  it('should pass activeCategory through to pipeline state', async () => {
    const { client } = createMockLlm();
    const pipeline = createPipeline({
      domainConfig,
      personaConfig,
      llmClient: client,
    });

    const input: AgentInput = {
      sessionId: 'active-category-test',
      content: 'More details about the church.',
      metadata: {},
    };

    const result = await pipeline.run(input, {
      activeCategory: 'history',
      turnContext: {
        turnNumber: 2,
        isFollowUp: true,
        previousTurns: [],
        askedQuestions: ['When was this?'],
        skippedFields: [],
      },
    });

    expect(result.activeCategory).toBe('history');
  });

  it('should skip structuring for greeting intent', async () => {
    const { client, callCount } = createGreetingMockLlm();
    const pipeline = createPipeline({
      domainConfig,
      personaConfig,
      llmClient: client,
    });

    const input: AgentInput = {
      sessionId: 'greeting-test',
      content: 'hi',
      metadata: {},
    };

    const result = await pipeline.run(input);

    expect(result.classifierOutput?.result.intent).toBe('greeting');
    expect(result.personaOutput).toBeDefined();
    expect(result.personaOutput?.result.response).toBeTruthy();
    // Structuring should NOT run for greetings
    expect(result.structuringOutput).toBeUndefined();
    // Only 2 LLM calls: classifier + persona (no context, gap, structuring)
    expect(callCount()).toBe(2);
  });
});
