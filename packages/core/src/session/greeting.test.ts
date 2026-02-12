import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import { generateGreeting } from './greeting.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain for community knowledge',
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
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

const personaConfig: PersonaConfig = {
  name: 'Test Chronicler',
  version: '1.0.0',
  tonality: 'warm',
  formality: 'informal',
  language: 'de',
  addressForm: 'du',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: true,
    validateWithSources: true,
  },
  systemPromptTemplate: 'You are a friendly chronicler.',
};

describe('generateGreeting', () => {
  it('should generate a greeting string from the LLM', async () => {
    const expectedGreeting = 'Hallo! Was kannst du mir über euer Dorf erzählen?';
    const invokeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        response: expectedGreeting,
        followUpQuestions: [],
      }),
    });
    const llmClient: LlmClient = { invoke: invokeFn };

    const result = await generateGreeting(personaConfig, domainConfig, llmClient);

    expect(result).toBe(expectedGreeting);
    expect(invokeFn).toHaveBeenCalledOnce();
  });

  it('should include domain and persona context in the prompt', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        response: 'Greeting',
        followUpQuestions: [],
      }),
    });
    const llmClient: LlmClient = { invoke: invokeFn };

    await generateGreeting(personaConfig, domainConfig, llmClient);

    const calls = invokeFn.mock.calls as Array<[{ systemPrompt: string }]>;
    const call = calls[0][0];
    expect(call.systemPrompt).toContain('test-domain');
    expect(call.systemPrompt).toContain('Test Chronicler');
    expect(call.systemPrompt).toContain('History');
    expect(call.systemPrompt).toContain('Nature');
    expect(call.systemPrompt).toContain('de');
  });
});
