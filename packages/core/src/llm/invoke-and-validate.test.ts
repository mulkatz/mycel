import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { LlmClient } from './llm-client.js';
import { invokeAndValidate } from './invoke-and-validate.js';
import { LlmError } from '@mycel/shared/src/utils/errors.js';

const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
});

function createMockClient(responses: string[]): LlmClient {
  let callIndex = 0;
  return {
    invoke: vi.fn().mockImplementation(() => {
      const content = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return Promise.resolve({ content });
    }),
  };
}

function mockCalls(client: LlmClient): Array<[{ userMessage: string }]> {
  return (client.invoke as ReturnType<typeof vi.fn>).mock.calls as Array<[{ userMessage: string }]>;
}

function callCount(client: LlmClient): number {
  return (client.invoke as ReturnType<typeof vi.fn>).mock.calls.length;
}

const baseRequest = {
  systemPrompt: 'You are a test agent.',
  userMessage: 'Test input',
};

describe('invokeAndValidate', () => {
  it('should return parsed data on first successful attempt', async () => {
    const client = createMockClient([JSON.stringify({ name: 'test', value: 42 })]);

    const result = await invokeAndValidate({
      llmClient: client,
      request: baseRequest,
      schema: TestSchema,
      agentName: 'test-agent',
    });

    expect(result).toEqual({ name: 'test', value: 42 });
    expect(callCount(client)).toBe(1);
  });

  it('should handle JSON wrapped in markdown code blocks', async () => {
    const client = createMockClient(['```json\n{"name": "test", "value": 42}\n```']);

    const result = await invokeAndValidate({
      llmClient: client,
      request: baseRequest,
      schema: TestSchema,
      agentName: 'test-agent',
    });

    expect(result).toEqual({ name: 'test', value: 42 });
  });

  it('should retry with correction prompt on JSON parse failure', async () => {
    const client = createMockClient([
      'not valid json at all',
      JSON.stringify({ name: 'fixed', value: 1 }),
    ]);

    const result = await invokeAndValidate({
      llmClient: client,
      request: baseRequest,
      schema: TestSchema,
      agentName: 'test-agent',
    });

    expect(result).toEqual({ name: 'fixed', value: 1 });
    expect(callCount(client)).toBe(2);

    const calls = mockCalls(client);
    expect(calls[1][0].userMessage).toContain('[CORRECTION]');
  });

  it('should retry with correction prompt on Zod validation failure', async () => {
    const client = createMockClient([
      JSON.stringify({ name: 'test', value: 'not-a-number' }),
      JSON.stringify({ name: 'test', value: 99 }),
    ]);

    const result = await invokeAndValidate({
      llmClient: client,
      request: baseRequest,
      schema: TestSchema,
      agentName: 'test-agent',
    });

    expect(result).toEqual({ name: 'test', value: 99 });
    expect(callCount(client)).toBe(2);
  });

  it('should throw AgentError after exhausting retries', async () => {
    const client = createMockClient([
      JSON.stringify({ bad: true }),
      JSON.stringify({ still: 'bad' }),
      JSON.stringify({ never: 'valid' }),
    ]);

    await expect(
      invokeAndValidate({
        llmClient: client,
        request: baseRequest,
        schema: TestSchema,
        agentName: 'test-agent',
        maxRetries: 1,
      }),
    ).rejects.toThrow('test-agent returned invalid output after 2 attempts');
  });

  it('should respect custom maxRetries', async () => {
    const client = createMockClient([
      JSON.stringify({ bad: true }),
      JSON.stringify({ bad: true }),
      JSON.stringify({ bad: true }),
      JSON.stringify({ name: 'finally', value: 3 }),
    ]);

    const result = await invokeAndValidate({
      llmClient: client,
      request: baseRequest,
      schema: TestSchema,
      agentName: 'test-agent',
      maxRetries: 3,
    });

    expect(result).toEqual({ name: 'finally', value: 3 });
    expect(callCount(client)).toBe(4);
  });

  it('should throw AgentError with zero retries on first failure', async () => {
    const client = createMockClient([JSON.stringify({ bad: true })]);

    await expect(
      invokeAndValidate({
        llmClient: client,
        request: baseRequest,
        schema: TestSchema,
        agentName: 'test-agent',
        maxRetries: 0,
      }),
    ).rejects.toThrow('test-agent returned invalid output after 1 attempts');
  });

  it('should re-throw LlmError immediately without retrying', async () => {
    const llmError = new LlmError('Rate limit exceeded', true);
    const client: LlmClient = {
      invoke: vi.fn().mockRejectedValue(llmError),
    };

    await expect(
      invokeAndValidate({
        llmClient: client,
        request: baseRequest,
        schema: TestSchema,
        agentName: 'test-agent',
      }),
    ).rejects.toThrow(llmError);

    expect(callCount(client)).toBe(1);
  });
});
