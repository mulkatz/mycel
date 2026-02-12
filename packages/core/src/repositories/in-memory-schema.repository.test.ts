import { describe, it, expect } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import { createInMemorySchemaRepository } from './in-memory-schema.repository.js';

const testDomainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [{ id: 'history', label: 'History', description: 'Historical knowledge' }],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
};

const testPersonaConfig: PersonaConfig = {
  name: 'test-persona',
  version: '1.0.0',
  tonality: 'warm',
  formality: 'informal',
  language: 'en',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: true,
    validateWithSources: false,
  },
  systemPromptTemplate: 'You are a test persona.',
};

describe('createInMemorySchemaRepository', () => {
  describe('domain schemas', () => {
    it('should save and retrieve a domain schema by id', async () => {
      const repo = createInMemorySchemaRepository();
      const saved = await repo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('test-domain');
      expect(saved.version).toBe(1);
      expect(saved.isActive).toBe(true);

      const loaded = await repo.getDomainSchema(saved.id);
      expect(loaded).toEqual(saved);
    });

    it('should return null for nonexistent domain schema', async () => {
      const repo = createInMemorySchemaRepository();
      const loaded = await repo.getDomainSchema('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should get the active domain schema', async () => {
      const repo = createInMemorySchemaRepository();
      await repo.saveDomainSchema({
        name: 'inactive',
        version: 1,
        config: testDomainConfig,
        isActive: false,
      });
      const active = await repo.saveDomainSchema({
        name: 'active',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });

      const result = await repo.getActiveDomainSchema();
      expect(result?.id).toBe(active.id);
      expect(result?.name).toBe('active');
    });

    it('should return null when no active domain schema exists', async () => {
      const repo = createInMemorySchemaRepository();
      await repo.saveDomainSchema({
        name: 'inactive',
        version: 1,
        config: testDomainConfig,
        isActive: false,
      });

      const result = await repo.getActiveDomainSchema();
      expect(result).toBeNull();
    });

    it('should deactivate previous active schema with same name when saving a new active one', async () => {
      const repo = createInMemorySchemaRepository();
      const first = await repo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });
      await repo.saveDomainSchema({
        name: 'test-domain',
        version: 2,
        config: testDomainConfig,
        isActive: true,
      });

      const firstLoaded = await repo.getDomainSchema(first.id);
      expect(firstLoaded?.isActive).toBe(false);

      const active = await repo.getActiveDomainSchema();
      expect(active?.version).toBe(2);
    });

    it('should not deactivate active schemas with different names', async () => {
      const repo = createInMemorySchemaRepository();
      const first = await repo.saveDomainSchema({
        name: 'domain-a',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });
      await repo.saveDomainSchema({
        name: 'domain-b',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });

      const firstLoaded = await repo.getDomainSchema(first.id);
      expect(firstLoaded?.isActive).toBe(true);
    });
  });

  describe('persona schemas', () => {
    it('should save and retrieve a persona schema by id', async () => {
      const repo = createInMemorySchemaRepository();
      const saved = await repo.savePersonaSchema({
        name: 'test-persona',
        version: 1,
        config: testPersonaConfig,
        isActive: true,
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('test-persona');

      const loaded = await repo.getPersonaSchema(saved.id);
      expect(loaded).toEqual(saved);
    });

    it('should return null for nonexistent persona schema', async () => {
      const repo = createInMemorySchemaRepository();
      const loaded = await repo.getPersonaSchema('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should get the active persona schema', async () => {
      const repo = createInMemorySchemaRepository();
      const active = await repo.savePersonaSchema({
        name: 'active',
        version: 1,
        config: testPersonaConfig,
        isActive: true,
      });

      const result = await repo.getActivePersonaSchema();
      expect(result?.id).toBe(active.id);
    });

    it('should deactivate previous active persona schema when saving a new active one', async () => {
      const repo = createInMemorySchemaRepository();
      const first = await repo.savePersonaSchema({
        name: 'first',
        version: 1,
        config: testPersonaConfig,
        isActive: true,
      });
      await repo.savePersonaSchema({
        name: 'second',
        version: 2,
        config: testPersonaConfig,
        isActive: true,
      });

      const firstLoaded = await repo.getPersonaSchema(first.id);
      expect(firstLoaded?.isActive).toBe(false);
    });
  });
});
