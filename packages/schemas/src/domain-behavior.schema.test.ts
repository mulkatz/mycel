import { describe, it, expect } from 'vitest';
import {
  DomainBehaviorConfigSchema,
  BehaviorPresetSchema,
  resolveBehaviorPreset,
} from './domain-behavior.schema.js';

describe('DomainBehaviorConfigSchema', () => {
  it('should validate a complete config', () => {
    const config = {
      schemaCreation: 'web_research',
      schemaEvolution: 'suggest',
      webSearch: 'bootstrap_only',
      knowledgeValidation: 'flag_conflicts',
      proactiveQuestioning: 'active',
      documentGeneration: 'manual',
    };
    const result = DomainBehaviorConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid enum values', () => {
    const config = {
      schemaCreation: 'invalid_value',
      schemaEvolution: 'fixed',
      webSearch: 'disabled',
      knowledgeValidation: 'trust_user',
      proactiveQuestioning: 'passive',
      documentGeneration: 'disabled',
    };
    const result = DomainBehaviorConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject missing fields', () => {
    const config = {
      schemaCreation: 'manual',
    };
    const result = DomainBehaviorConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should parse all schemaCreation variants', () => {
    for (const variant of ['manual', 'web_research', 'hybrid'] as const) {
      const config = resolveBehaviorPreset('manual');
      config.schemaCreation = variant;
      expect(DomainBehaviorConfigSchema.parse(config).schemaCreation).toBe(variant);
    }
  });

  it('should parse all webSearch variants', () => {
    for (const variant of ['disabled', 'bootstrap_only', 'enrichment', 'full'] as const) {
      const config = resolveBehaviorPreset('manual');
      config.webSearch = variant;
      expect(DomainBehaviorConfigSchema.parse(config).webSearch).toBe(variant);
    }
  });

  it('should parse all documentGeneration variants', () => {
    for (const variant of ['disabled', 'manual', 'on_session_end', 'threshold'] as const) {
      const config = resolveBehaviorPreset('manual');
      config.documentGeneration = variant;
      expect(DomainBehaviorConfigSchema.parse(config).documentGeneration).toBe(variant);
    }
  });
});

describe('BehaviorPresetSchema', () => {
  it('should accept valid presets', () => {
    expect(BehaviorPresetSchema.parse('manual')).toBe('manual');
    expect(BehaviorPresetSchema.parse('balanced')).toBe('balanced');
    expect(BehaviorPresetSchema.parse('full_auto')).toBe('full_auto');
  });

  it('should reject invalid presets', () => {
    expect(BehaviorPresetSchema.safeParse('unknown').success).toBe(false);
  });
});

describe('resolveBehaviorPreset', () => {
  it('should resolve manual preset', () => {
    const config = resolveBehaviorPreset('manual');
    expect(config.schemaCreation).toBe('manual');
    expect(config.schemaEvolution).toBe('fixed');
    expect(config.webSearch).toBe('disabled');
    expect(config.knowledgeValidation).toBe('trust_user');
    expect(config.proactiveQuestioning).toBe('gentle');
    expect(config.documentGeneration).toBe('manual');
  });

  it('should resolve balanced preset', () => {
    const config = resolveBehaviorPreset('balanced');
    expect(config.schemaCreation).toBe('web_research');
    expect(config.schemaEvolution).toBe('suggest');
    expect(config.webSearch).toBe('bootstrap_only');
    expect(config.knowledgeValidation).toBe('flag_conflicts');
    expect(config.proactiveQuestioning).toBe('active');
    expect(config.documentGeneration).toBe('manual');
  });

  it('should resolve full_auto preset', () => {
    const config = resolveBehaviorPreset('full_auto');
    expect(config.schemaCreation).toBe('web_research');
    expect(config.schemaEvolution).toBe('auto');
    expect(config.webSearch).toBe('full');
    expect(config.knowledgeValidation).toBe('verify');
    expect(config.proactiveQuestioning).toBe('active');
    expect(config.documentGeneration).toBe('on_session_end');
  });

  it('should return a new object each time (no shared references)', () => {
    const a = resolveBehaviorPreset('manual');
    const b = resolveBehaviorPreset('manual');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
