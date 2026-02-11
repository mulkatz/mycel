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

function createMockState(content: string): PipelineGraphState {
  return {
    sessionId: 'test-session',
    input: { sessionId: 'test-session', content, metadata: {} },
    classifierOutput: undefined,
    contextDispatcherOutput: undefined,
    gapReasoningOutput: undefined,
    personaOutput: undefined,
    structuringOutput: undefined,
  };
}

describe('createClassifierNode', () => {
  it('should classify input using LLM and return ClassifierOutput', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'history',
          confidence: 0.9,
          reasoning: 'Historical content detected',
        }),
      }),
    };

    const node = createClassifierNode(domainConfig, mockLlm);
    const result = await node(createMockState('The church was built in 1732'));

    expect(result.classifierOutput).toBeDefined();
    expect(result.classifierOutput?.result.categoryId).toBe('history');
    expect(result.classifierOutput?.result.confidence).toBe(0.9);
    expect(result.classifierOutput?.agentRole).toBe('classifier');
  });

  it('should throw when LLM returns unknown categoryId', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          categoryId: 'unknown-category',
          confidence: 0.5,
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
});
