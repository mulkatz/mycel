import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from './config-loader.js';
import { ConfigurationError } from '@mycel/shared/src/utils/errors.js';
import { SchemaValidationError } from '@mycel/shared/src/utils/errors.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const validDomain = {
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
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

const validPersona = {
  name: 'Test Persona',
  version: '1.0.0',
  tonality: 'friendly',
  formality: 'informal',
  language: 'en',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: false,
    validateWithSources: true,
  },
  systemPromptTemplate: 'You are a test assistant.',
};

describe('loadConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load valid domain and persona configs', async () => {
    const { readFile } = await import('node:fs/promises');
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockImplementation((path: unknown) => {
      const filePath = String(path);
      if (filePath.endsWith('domain.json')) {
        return Promise.resolve(JSON.stringify(validDomain));
      }
      if (filePath.endsWith('persona.json')) {
        return Promise.resolve(JSON.stringify(validPersona));
      }
      return Promise.reject(new Error(`Unexpected file: ${filePath}`));
    });

    const config = await loadConfig('/test/config');
    expect(config.domain.name).toBe('test-domain');
    expect(config.persona.name).toBe('Test Persona');
    expect(config.domain.categories).toHaveLength(1);
  });

  it('should throw ConfigurationError for missing files', async () => {
    const { readFile } = await import('node:fs/promises');
    const mockReadFile = vi.mocked(readFile);
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockReadFile.mockRejectedValue(error);

    await expect(loadConfig('/nonexistent')).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid JSON', async () => {
    const { readFile } = await import('node:fs/promises');
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockResolvedValue('not valid json{{{');

    await expect(loadConfig('/test/config')).rejects.toThrow(ConfigurationError);
  });

  it('should throw SchemaValidationError for invalid domain config', async () => {
    const { readFile } = await import('node:fs/promises');
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockImplementation((path: unknown) => {
      const filePath = String(path);
      if (filePath.endsWith('domain.json')) {
        return Promise.resolve(JSON.stringify({ invalid: true }));
      }
      if (filePath.endsWith('persona.json')) {
        return Promise.resolve(JSON.stringify(validPersona));
      }
      return Promise.reject(new Error(`Unexpected file: ${filePath}`));
    });

    await expect(loadConfig('/test/config')).rejects.toThrow(SchemaValidationError);
  });

  it('should throw SchemaValidationError for invalid persona config', async () => {
    const { readFile } = await import('node:fs/promises');
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockImplementation((path: unknown) => {
      const filePath = String(path);
      if (filePath.endsWith('domain.json')) {
        return Promise.resolve(JSON.stringify(validDomain));
      }
      if (filePath.endsWith('persona.json')) {
        return Promise.resolve(JSON.stringify({ invalid: true }));
      }
      return Promise.reject(new Error(`Unexpected file: ${filePath}`));
    });

    await expect(loadConfig('/test/config')).rejects.toThrow(SchemaValidationError);
  });
});
