import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createStructuringNode } from './structuring.js';

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
      metadata: { source: 'test' },
    },
    classifierOutput: {
      agentRole: 'classifier',
      result: { categoryId: 'history', confidence: 0.9 },
      confidence: 0.9,
    },
    contextDispatcherOutput: undefined,
    gapReasoningOutput: {
      agentRole: 'gap-reasoning',
      result: {
        gaps: [{ field: 'sources', description: 'No sources provided', priority: 'high' }],
        followUpQuestions: ['Do you have sources?'],
      },
      confidence: 1.0,
    },
    personaOutput: undefined,
    structuringOutput: undefined,
  };
}

describe('createStructuringNode', () => {
  it('should create a structured KnowledgeEntry from LLM response', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Historic Church of 1732',
          content: 'The old church in the village was built in 1732.',
          structuredData: { year: 1732 },
          tags: ['history', 'architecture'],
          isComplete: false,
          missingFields: ['sources'],
        }),
      }),
    };

    const node = createStructuringNode(domainConfig, mockLlm);
    const result = await node(createMockState());

    expect(result.structuringOutput).toBeDefined();
    expect(result.structuringOutput?.agentRole).toBe('structuring');

    if (!result.structuringOutput) throw new Error('Expected structuringOutput');
    const { entry, isComplete, missingFields } = result.structuringOutput.result;
    expect(entry.id).toBeTruthy();
    expect(entry.categoryId).toBe('history');
    expect(entry.title).toBe('Historic Church of 1732');
    expect(entry.tags).toContain('history');
    expect(entry.structuredData).toEqual({ year: 1732 });
    expect(entry.source.type).toBe('text');
    expect(entry.followUp).toBeDefined();
    expect(entry.followUp?.gaps).toHaveLength(1);
    expect(entry.followUp?.suggestedQuestions).toHaveLength(1);
    expect(isComplete).toBe(false);
    expect(missingFields).toContain('sources');
  });

  it('should throw when classifier output is missing', async () => {
    const mockLlm: LlmClient = { invoke: vi.fn() };

    const node = createStructuringNode(domainConfig, mockLlm);
    const stateWithoutClassifier = { ...createMockState(), classifierOutput: undefined };

    await expect(node(stateWithoutClassifier)).rejects.toThrow('classifier output');
  });

  it('should throw for unknown category', async () => {
    const mockLlm: LlmClient = { invoke: vi.fn() };

    const node = createStructuringNode(domainConfig, mockLlm);
    const badState: PipelineGraphState = {
      ...createMockState(),
      classifierOutput: {
        agentRole: 'classifier',
        result: { categoryId: 'nonexistent', confidence: 0.9 },
        confidence: 0.9,
      },
    };

    await expect(node(badState)).rejects.toThrow('Unknown category');
  });

  it('should not include followUp when no gaps exist', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Test Entry',
          content: 'Test content',
          structuredData: {},
          tags: [],
          isComplete: true,
          missingFields: [],
        }),
      }),
    };

    const node = createStructuringNode(domainConfig, mockLlm);
    const stateNoGaps: PipelineGraphState = {
      ...createMockState(),
      gapReasoningOutput: {
        agentRole: 'gap-reasoning',
        result: { gaps: [], followUpQuestions: [] },
        confidence: 1.0,
      },
    };

    const result = await node(stateNoGaps);
    expect(result.structuringOutput?.result.entry.followUp).toBeUndefined();
  });
});
