import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createClassifierNode } from './classifier.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical events',
      requiredFields: ['period'],
    },
    { id: 'nature', label: 'Nature', description: 'Natural environment' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

function createMockState(content: string, overrides?: Partial<PipelineGraphState>): PipelineGraphState {
  return {
    sessionId: 'test-session',
    input: { sessionId: 'test-session', content, metadata: {} },
    classifierOutput: undefined,
    contextDispatcherOutput: undefined,
    gapReasoningOutput: undefined,
    personaOutput: undefined,
    structuringOutput: undefined,
    turnContext: undefined,
    activeCategory: undefined,
    ...overrides,
  };
}

describe('createClassifierNode', () => {
  it('should classify input using LLM and return ClassifierOutput', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.9,
          isTopicChange: false,
          reasoning: 'Historical content detected',
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    const result = await node(createMockState('The church was built in 1732'));

    expect(result.classifierOutput).toBeDefined();
    expect(result.classifierOutput?.result.categoryId).toBe('history');
    expect(result.classifierOutput?.result.confidence).toBe(0.9);
    expect(result.classifierOutput?.result.isTopicChange).toBe(false);
    expect(result.classifierOutput?.agentRole).toBe('classifier');
  });

  it('should throw when LLM returns unknown categoryId', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'unknown-category',
          confidence: 0.5,
          isTopicChange: false,
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);

    await expect(node(createMockState('test'))).rejects.toThrow('unknown categoryId');
  });

  it('should throw when LLM returns invalid output', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({ invalid: true }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);

    await expect(node(createMockState('test'))).rejects.toThrow('invalid output');
  });

  it('should pass category list in system prompt', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.8,
          isTopicChange: false,
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    await node(createMockState('test'));

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    const invokeCall = calls[0];
    expect(invokeCall[0].systemPrompt).toContain('history');
    expect(invokeCall[0].systemPrompt).toContain('nature');
  });

  it('should accept _uncategorized as a valid categoryId', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: '_uncategorized',
          confidence: 0.3,
          isTopicChange: false,
          reasoning: 'Does not fit any existing category.',
          summary: 'Personal childhood memory about summers',
          suggestedCategoryLabel: 'Childhood Memories',
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    const result = await node(createMockState('I remember the summers here were beautiful'));

    expect(result.classifierOutput).toBeDefined();
    expect(result.classifierOutput?.result.categoryId).toBe('_uncategorized');
    expect(result.classifierOutput?.result.confidence).toBe(0.3);
    expect(result.classifierOutput?.result.summary).toBe(
      'Personal childhood memory about summers',
    );
    expect(result.classifierOutput?.result.suggestedCategoryLabel).toBe('Childhood Memories');
  });

  it('should include _uncategorized instruction in system prompt', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.8,
          isTopicChange: false,
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    await node(createMockState('test'));

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    expect(calls[0][0].systemPrompt).toContain('_uncategorized');
    expect(calls[0][0].systemPrompt).toContain('suggestedCategoryLabel');
  });

  it('should classify on follow-up turns (no skip)', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.9,
          isTopicChange: false,
          reasoning: 'Still discussing history',
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    const state = createMockState('18th century', {
      turnContext: {
        turnNumber: 2,
        isFollowUp: true,
        previousTurns: [],
        askedQuestions: ['When was this?'],
      },
      activeCategory: 'history',
    });

    const result = await node(state);

    expect(result.classifierOutput).toBeDefined();
    expect(result.classifierOutput?.result.categoryId).toBe('history');
    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
  });

  it('should include session context in prompt for follow-up turns', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.9,
          isTopicChange: false,
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    const state = createMockState('I dont know about that', {
      turnContext: {
        turnNumber: 2,
        isFollowUp: true,
        previousTurns: [],
        askedQuestions: ['What time period?'],
      },
      activeCategory: 'history',
    });

    await node(state);

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    expect(calls[0][0].systemPrompt).toContain('[SESSION_CONTEXT]');
    expect(calls[0][0].systemPrompt).toContain('history');
    expect(calls[0][0].systemPrompt).toContain('What time period?');
  });

  it('should detect topic change when user changes subject', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'nature',
          confidence: 0.85,
          isTopicChange: true,
          reasoning: 'User switched from history to nature topic.',
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    const state = createMockState('We also have a beautiful lake nearby', {
      turnContext: {
        turnNumber: 2,
        isFollowUp: true,
        previousTurns: [],
        askedQuestions: ['When was this?'],
      },
      activeCategory: 'history',
    });

    const result = await node(state);

    expect(result.classifierOutput?.result.categoryId).toBe('nature');
    expect(result.classifierOutput?.result.isTopicChange).toBe(true);
  });

  it('should include isTopicChange in prompt instructions', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.9,
          isTopicChange: false,
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    await node(createMockState('test'));

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    expect(calls[0][0].systemPrompt).toContain('isTopicChange');
  });
});
