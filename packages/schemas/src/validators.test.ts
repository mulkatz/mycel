import { describe, it, expect } from 'vitest';
import { validateDomainConfig, validatePersonaConfig } from './validators.js';
import { SchemaValidationError } from '@mycel/shared/src/utils/errors.js';

describe('validateDomainConfig', () => {
  const validDomain = {
    name: 'test-domain',
    version: '1.0.0',
    description: 'A test domain',
    categories: [
      {
        id: 'cat1',
        label: 'Category 1',
        description: 'First category',
      },
    ],
    ingestion: {
      allowedModalities: ['text'] as const,
      primaryLanguage: 'en',
      supportedLanguages: ['en'],
    },
  };

  it('should accept a valid domain configuration', () => {
    const result = validateDomainConfig(validDomain);
    expect(result.name).toBe('test-domain');
    expect(result.categories).toHaveLength(1);
  });

  it('should reject a domain with missing name', () => {
    const invalid = { ...validDomain, name: '' };
    expect(() => validateDomainConfig(invalid)).toThrow(SchemaValidationError);
  });

  it('should reject a domain with invalid version format', () => {
    const invalid = { ...validDomain, version: 'invalid' };
    expect(() => validateDomainConfig(invalid)).toThrow(SchemaValidationError);
  });

  it('should reject a domain with no categories', () => {
    const invalid = { ...validDomain, categories: [] };
    expect(() => validateDomainConfig(invalid)).toThrow(SchemaValidationError);
  });

  it('should reject a domain with no allowed modalities', () => {
    const invalid = {
      ...validDomain,
      ingestion: { ...validDomain.ingestion, allowedModalities: [] },
    };
    expect(() => validateDomainConfig(invalid)).toThrow(SchemaValidationError);
  });

  it('should include validation error details', () => {
    try {
      validateDomainConfig({});
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).validationErrors.length).toBeGreaterThan(0);
    }
  });
});

describe('validatePersonaConfig', () => {
  const validPersona = {
    name: 'Test Persona',
    version: '1.0.0',
    tonality: 'friendly',
    formality: 'informal' as const,
    language: 'en',
    promptBehavior: {
      gapAnalysis: true,
      maxFollowUpQuestions: 3,
      encourageStorytelling: false,
      validateWithSources: true,
    },
    systemPromptTemplate: 'You are a helpful assistant.',
  };

  it('should accept a valid persona configuration', () => {
    const result = validatePersonaConfig(validPersona);
    expect(result.name).toBe('Test Persona');
    expect(result.promptBehavior.gapAnalysis).toBe(true);
  });

  it('should reject a persona with invalid formality', () => {
    const invalid = { ...validPersona, formality: 'super-formal' };
    expect(() => validatePersonaConfig(invalid)).toThrow(SchemaValidationError);
  });

  it('should reject a persona with too many follow-up questions', () => {
    const invalid = {
      ...validPersona,
      promptBehavior: { ...validPersona.promptBehavior, maxFollowUpQuestions: 20 },
    };
    expect(() => validatePersonaConfig(invalid)).toThrow(SchemaValidationError);
  });

  it('should accept optional addressForm', () => {
    const withAddress = { ...validPersona, addressForm: 'du' };
    const result = validatePersonaConfig(withAddress);
    expect(result.addressForm).toBe('du');
  });
});
