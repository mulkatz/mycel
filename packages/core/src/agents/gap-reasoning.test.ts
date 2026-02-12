import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createGapReasoningNode } from './gap-reasoning.js';

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
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

function createMockState(): PipelineGraphState {
  return {
    sessionId: 'test-session',
    input: {
      sessionId: 'test-session',
      content: 'The old church was built in 1732',
      metadata: {},
    },
    classifierOutput: {
      agentRole: 'classifier',
      result: { categoryId: 'history', confidence: 0.9, intent: 'content' as const },
      confidence: 0.9,
    },
    contextDispatcherOutput: {
      agentRole: 'context-dispatcher',
      result: { relevantContext: [], contextSummary: 'No context.' },
      confidence: 1.0,
    },
    gapReasoningOutput: undefined,
    personaOutput: undefined,
    structuringOutput: undefined,
    turnContext: undefined,
    activeCategory: undefined,
  };
}

function createUncategorizedState(): PipelineGraphState {
  return {
    sessionId: 'test-session',
    input: {
      sessionId: 'test-session',
      content: 'I remember the summers here were always so beautiful as a child',
      metadata: {},
    },
    classifierOutput: {
      agentRole: 'classifier',
      result: {
        categoryId: '_uncategorized',
        confidence: 0.3,
        intent: 'content' as const,
        summary: 'Personal childhood memory about summers',
        suggestedCategoryLabel: 'Childhood Memories',
      },
      confidence: 0.3,
    },
    contextDispatcherOutput: {
      agentRole: 'context-dispatcher',
      result: { relevantContext: [], contextSummary: 'No context.' },
      confidence: 1.0,
    },
    gapReasoningOutput: undefined,
    personaOutput: undefined,
    structuringOutput: undefined,
    turnContext: undefined,
    activeCategory: undefined,
  };
}

describe('createGapReasoningNode', () => {
  it('should analyze gaps and return follow-up questions', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          gaps: [
            { field: 'period', description: 'Exact period unclear', priority: 'high' },
            { field: 'sources', description: 'No sources', priority: 'medium' },
          ],
          followUpQuestions: ['When was this exactly?', 'Do you have sources?'],
          reasoning: 'Required fields missing.',
        }),
      }),
    };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    const result = await node(createMockState());

    expect(result.gapReasoningOutput).toBeDefined();
    expect(result.gapReasoningOutput?.agentRole).toBe('gap-reasoning');
    expect(result.gapReasoningOutput?.result.gaps).toHaveLength(2);
    expect(result.gapReasoningOutput?.result.followUpQuestions).toHaveLength(2);
  });

  it('should throw when classifier output is missing', async () => {
    const mockLlm: LlmClient = { invoke: vi.fn() };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    const stateWithoutClassifier = {
      ...createMockState(),
      classifierOutput: undefined,
    };

    await expect(node(stateWithoutClassifier)).rejects.toThrow('classifier output');
  });

  it('should throw for unknown category that is not _uncategorized', async () => {
    const mockLlm: LlmClient = { invoke: vi.fn() };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    const stateWithBadCategory: PipelineGraphState = {
      ...createMockState(),
      classifierOutput: {
        agentRole: 'classifier',
        result: { categoryId: 'nonexistent', confidence: 0.9, intent: 'content' as const },
        confidence: 0.9,
      },
    };

    await expect(node(stateWithBadCategory)).rejects.toThrow('Unknown category');
  });

  it('should include required fields in the system prompt', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          gaps: [],
          followUpQuestions: [],
        }),
      }),
    };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    await node(createMockState());

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    const invokeCall = calls[0];
    expect(invokeCall[0].systemPrompt).toContain('period');
    expect(invokeCall[0].systemPrompt).toContain('sources');
  });

  it('should handle _uncategorized input with exploratory questions', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          gaps: [
            { field: 'timeframe', description: 'When did this happen?', priority: 'medium' },
            { field: 'location', description: 'Where was this?', priority: 'medium' },
          ],
          followUpQuestions: [
            'When did this happen?',
            'Where exactly was this?',
            'Is this something that happens regularly here?',
          ],
          reasoning: 'Exploratory questions to understand the topic.',
        }),
      }),
    };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    const result = await node(createUncategorizedState());

    expect(result.gapReasoningOutput).toBeDefined();
    expect(result.gapReasoningOutput?.result.gaps).toHaveLength(2);
    expect(result.gapReasoningOutput?.result.followUpQuestions).toHaveLength(3);
  });

  it('should use exploratory prompt for _uncategorized input', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          gaps: [],
          followUpQuestions: [],
        }),
      }),
    };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    await node(createUncategorizedState());

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    const prompt = calls[0][0].systemPrompt;
    expect(prompt).toContain('exploratory mode');
    expect(prompt).toContain('Childhood Memories');
    expect(prompt).toContain('Personal childhood memory about summers');
    expect(prompt).not.toContain('Required fields');
  });

  it('should truncate follow-up questions to max 3', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          gaps: [],
          followUpQuestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'],
          reasoning: 'Many questions.',
        }),
      }),
    };

    const node = createGapReasoningNode(domainConfig, mockLlm);
    const result = await node(createMockState());

    expect(result.gapReasoningOutput?.result.followUpQuestions).toHaveLength(3);
  });
});
