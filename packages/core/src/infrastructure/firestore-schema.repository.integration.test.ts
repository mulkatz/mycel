import { describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import { createFirestoreSchemaRepository } from './firestore-schema.repository.js';

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

describe('FirestoreSchemaRepository (integration)', () => {
  const db = new Firestore({ projectId: 'mycel-test' });
  const tenantBase = db.collection('tenants').doc('test-tenant');
  const repo = createFirestoreSchemaRepository(tenantBase);

  beforeEach(async () => {
    const domainDocs = await tenantBase.collection('domainSchemas').listDocuments();
    for (const doc of domainDocs) {
      await doc.delete();
    }
    const personaDocs = await tenantBase.collection('personaSchemas').listDocuments();
    for (const doc of personaDocs) {
      await doc.delete();
    }
  });

  describe('domain schemas', () => {
    it('should save and retrieve a domain schema', async () => {
      const saved = await repo.saveDomainSchema({
        name: 'test-domain',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });

      expect(saved.id).toBeTruthy();
      expect(saved.name).toBe('test-domain');
      expect(saved.isActive).toBe(true);
      expect(saved.createdAt).toBeInstanceOf(Date);

      const loaded = await repo.getDomainSchema(saved.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe('test-domain');
      expect(loaded?.config.name).toBe('test-domain');
    });

    it('should return null for nonexistent domain schema', async () => {
      const result = await repo.getDomainSchema('nonexistent');
      expect(result).toBeNull();
    });

    it('should get active domain schema', async () => {
      await repo.saveDomainSchema({
        name: 'inactive',
        version: 1,
        config: testDomainConfig,
        isActive: false,
      });
      const active = await repo.saveDomainSchema({
        name: 'active',
        version: 2,
        config: testDomainConfig,
        isActive: true,
      });

      const result = await repo.getActiveDomainSchema();
      expect(result?.id).toBe(active.id);
      expect(result?.name).toBe('active');
    });

    it('should return null when no active domain schema exists', async () => {
      await repo.saveDomainSchema({
        name: 'inactive',
        version: 1,
        config: testDomainConfig,
        isActive: false,
      });

      const result = await repo.getActiveDomainSchema();
      expect(result).toBeNull();
    });

    it('should deactivate previous active schema when saving new active one', async () => {
      const first = await repo.saveDomainSchema({
        name: 'first',
        version: 1,
        config: testDomainConfig,
        isActive: true,
      });

      await repo.saveDomainSchema({
        name: 'second',
        version: 2,
        config: testDomainConfig,
        isActive: true,
      });

      const firstLoaded = await repo.getDomainSchema(first.id);
      expect(firstLoaded?.isActive).toBe(false);

      const active = await repo.getActiveDomainSchema();
      expect(active?.name).toBe('second');
    });
  });

  describe('persona schemas', () => {
    it('should save and retrieve a persona schema', async () => {
      const saved = await repo.savePersonaSchema({
        name: 'test-persona',
        version: 1,
        config: testPersonaConfig,
        isActive: true,
      });

      expect(saved.id).toBeTruthy();
      expect(saved.name).toBe('test-persona');

      const loaded = await repo.getPersonaSchema(saved.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.config.tonality).toBe('warm');
    });

    it('should return null for nonexistent persona schema', async () => {
      const result = await repo.getPersonaSchema('nonexistent');
      expect(result).toBeNull();
    });

    it('should get active persona schema', async () => {
      const active = await repo.savePersonaSchema({
        name: 'active',
        version: 1,
        config: testPersonaConfig,
        isActive: true,
      });

      const result = await repo.getActivePersonaSchema();
      expect(result?.id).toBe(active.id);
    });

    it('should deactivate previous active persona schema', async () => {
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
