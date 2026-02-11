import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLlmClient } from './llm-client.js';

describe('createLlmClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('mock mode', () => {
    beforeEach(() => {
      process.env['MYCEL_MOCK_LLM'] = 'true';
    });

    it('should create a mock client when MYCEL_MOCK_LLM is true', async () => {
      const client = await createLlmClient();
      expect(client).toBeDefined();
      expect(typeof client.invoke).toBe('function');
    });

    it('should return classifier-like response for classifier prompts', async () => {
      const client = await createLlmClient();
      const response = await client.invoke({
        systemPrompt: 'You are a classifier agent.',
        userMessage: 'Test input',
      });

      expect(response.content).toBeTruthy();
      const parsed = JSON.parse(response.content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('categoryId');
      expect(parsed).toHaveProperty('confidence');
    });

    it('should return gap-reasoning response for gap analysis prompts', async () => {
      const client = await createLlmClient();
      const response = await client.invoke({
        systemPrompt: 'You are a gap-reasoning agent.',
        userMessage: 'Test input',
      });

      const parsed = JSON.parse(response.content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('gaps');
      expect(parsed).toHaveProperty('followUpQuestions');
    });

    it('should return persona response for persona prompts', async () => {
      const client = await createLlmClient();
      const response = await client.invoke({
        systemPrompt: 'You are a persona agent.',
        userMessage: 'Test input',
      });

      const parsed = JSON.parse(response.content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('response');
      expect(parsed).toHaveProperty('followUpQuestions');
    });

    it('should return structuring response for structuring prompts', async () => {
      const client = await createLlmClient();
      const response = await client.invoke({
        systemPrompt: 'You are a structuring agent.',
        userMessage: 'Test input',
      });

      const parsed = JSON.parse(response.content) as Record<string, unknown>;
      expect(parsed).toHaveProperty('title');
      expect(parsed).toHaveProperty('tags');
    });

    it('should include token usage in response', async () => {
      const client = await createLlmClient();
      const response = await client.invoke({
        systemPrompt: 'Test prompt',
        userMessage: 'Test input',
      });

      expect(response.tokenUsage).toBeDefined();
      expect(response.tokenUsage?.input).toBeGreaterThan(0);
      expect(response.tokenUsage?.output).toBeGreaterThan(0);
    });
  });

  describe('vertex mode', () => {
    it('should throw ConfigurationError when GCP_PROJECT_ID is missing', async () => {
      delete process.env['MYCEL_MOCK_LLM'];
      delete process.env['GCP_PROJECT_ID'];

      await expect(createLlmClient()).rejects.toThrow('GCP_PROJECT_ID');
    });
  });
});
