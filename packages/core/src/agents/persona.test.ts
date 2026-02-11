import { describe, it, expect, vi } from 'vitest';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createPersonaNode } from './persona.js';

const personaConfig: PersonaConfig = {
  name: 'Test Chronicler',
  version: '1.0.0',
  tonality: 'warm, friendly',
  formality: 'informal',
  language: 'en',
  addressForm: 'you',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: true,
    validateWithSources: true,
  },
  systemPromptTemplate: 'You are a friendly chronicler.',
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
      result: { categoryId: 'history', confidence: 0.9 },
      confidence: 0.9,
    },
    contextDispatcherOutput: undefined,
    gapReasoningOutput: {
      agentRole: 'gap-reasoning',
      result: {
        gaps: [{ field: 'period', description: 'Exact period unclear', priority: 'high' }],
        followUpQuestions: ['Can you specify the exact time period?'],
      },
      confidence: 1.0,
    },
    personaOutput: undefined,
    structuringOutput: undefined,
    turnContext: undefined,
  };
}

describe('createPersonaNode', () => {
  it('should generate persona response with follow-up questions', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          response: 'Thank you for sharing! Can you tell me more?',
          followUpQuestions: ['When exactly was this?'],
        }),
      }),
    };

    const node = createPersonaNode(personaConfig, mockLlm);
    const result = await node(createMockState());

    expect(result.personaOutput).toBeDefined();
    expect(result.personaOutput?.agentRole).toBe('persona');
    expect(result.personaOutput?.result.response).toContain('Thank you');
    expect(result.personaOutput?.result.followUpQuestions).toHaveLength(1);
  });

  it('should include persona name and tonality in system prompt', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          response: 'Test response',
          followUpQuestions: [],
        }),
      }),
    };

    const node = createPersonaNode(personaConfig, mockLlm);
    await node(createMockState());

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    const invokeCall = calls[0];
    expect(invokeCall[0].systemPrompt).toContain('Test Chronicler');
    expect(invokeCall[0].systemPrompt).toContain('warm, friendly');
    expect(invokeCall[0].systemPrompt).toContain('informal');
  });

  it('should include gap information in system prompt', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          response: 'Test',
          followUpQuestions: [],
        }),
      }),
    };

    const node = createPersonaNode(personaConfig, mockLlm);
    await node(createMockState());

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    const invokeCall = calls[0];
    expect(invokeCall[0].systemPrompt).toContain('period');
    expect(invokeCall[0].systemPrompt).toContain('Exact period unclear');
  });

  it('should throw on invalid LLM response', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({ invalid: true }),
      }),
    };

    const node = createPersonaNode(personaConfig, mockLlm);

    await expect(node(createMockState())).rejects.toThrow('invalid output');
  });

  it('should present only top 3 gaps even when more exist', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          response: 'Thanks for sharing!',
          followUpQuestions: ['Q1?', 'Q2?'],
        }),
      }),
    };

    const stateWithManyGaps: PipelineGraphState = {
      ...createMockState(),
      gapReasoningOutput: {
        agentRole: 'gap-reasoning',
        result: {
          gaps: [
            { field: 'period', description: 'Period unclear', priority: 'high' },
            { field: 'sources', description: 'No sources', priority: 'high' },
            { field: 'location', description: 'Location unclear', priority: 'medium' },
            { field: 'architect', description: 'Architect unknown', priority: 'low' },
            { field: 'material', description: 'Material not specified', priority: 'low' },
          ],
          followUpQuestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'],
        },
        confidence: 1.0,
      },
    };

    const node = createPersonaNode(personaConfig, mockLlm);
    await node(stateWithManyGaps);

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    const prompt = calls[0][0].systemPrompt;
    // Only top 3 gaps should be in the prompt
    expect(prompt).toContain('period');
    expect(prompt).toContain('sources');
    expect(prompt).toContain('location');
    expect(prompt).not.toContain('architect');
    expect(prompt).not.toContain('material');
  });

  it('should generate warm closing when no gaps exist', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          response: 'Thank you so much for sharing this wonderful story!',
          followUpQuestions: [],
        }),
      }),
    };

    const stateNoGaps: PipelineGraphState = {
      ...createMockState(),
      gapReasoningOutput: {
        agentRole: 'gap-reasoning',
        result: {
          gaps: [],
          followUpQuestions: [],
        },
        confidence: 1.0,
      },
    };

    const node = createPersonaNode(personaConfig, mockLlm);
    const result = await node(stateNoGaps);

    expect(result.personaOutput?.result.response).toBeTruthy();
    expect(result.personaOutput?.result.followUpQuestions).toHaveLength(0);

    const calls = (mockLlm.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ systemPrompt: string }]
    >;
    expect(calls[0][0].systemPrompt).toContain('warm closing message');
  });

  it('should truncate follow-up questions from LLM to maxQuestions', async () => {
    const mockLlm: LlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          response: 'Test',
          followUpQuestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'],
        }),
      }),
    };

    const node = createPersonaNode(personaConfig, mockLlm);
    const result = await node(createMockState());

    expect(result.personaOutput?.result.followUpQuestions).toHaveLength(3);
  });
});
