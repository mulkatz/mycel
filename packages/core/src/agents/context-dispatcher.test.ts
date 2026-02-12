import { describe, it, expect } from 'vitest';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createContextDispatcherNode } from './context-dispatcher.js';

function createMockState(): PipelineGraphState {
  return {
    sessionId: 'test-session',
    input: { sessionId: 'test-session', content: 'test content', metadata: {} },
    classifierOutput: {
      agentRole: 'classifier',
      result: { categoryId: 'history', confidence: 0.9 },
      confidence: 0.9,
    },
    contextDispatcherOutput: undefined,
    gapReasoningOutput: undefined,
    personaOutput: undefined,
    structuringOutput: undefined,
    turnContext: undefined,
    activeCategory: undefined,
  };
}

describe('createContextDispatcherNode', () => {
  it('should return empty context as stub', async () => {
    const node = createContextDispatcherNode();
    const result = await node(createMockState());

    expect(result.contextDispatcherOutput).toBeDefined();
    expect(result.contextDispatcherOutput?.agentRole).toBe('context-dispatcher');
    expect(result.contextDispatcherOutput?.result.relevantContext).toEqual([]);
    expect(result.contextDispatcherOutput?.result.contextSummary).toContain('not yet integrated');
  });

  it('should have confidence of 1.0', async () => {
    const node = createContextDispatcherNode();
    const result = await node(createMockState());

    expect(result.contextDispatcherOutput?.confidence).toBe(1.0);
  });
});
