import { describe, it, expect, beforeEach } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';

const validPersonaConfig: PersonaConfig = {
  name: 'Test Persona',
  version: '1.0.0',
  tonality: 'warm and encouraging',
  formality: 'informal',
  language: 'en',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: true,
    validateWithSources: false,
  },
  systemPromptTemplate: 'You are {{name}}, a friendly interviewer.',
};

const sharedDeps = {} as SharedDeps;

function jsonPost(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function jsonPut(body: Record<string, unknown>): RequestInit {
  return {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('Persona Routes', () => {
  let app: OpenAPIHono<AppEnv>;
  let schemaRepo: SchemaRepository;

  beforeEach(() => {
    schemaRepo = createInMemorySchemaRepository();

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: createInMemoryKnowledgeRepository(),
      schemaRepository: schemaRepo,
    } as TenantRepositories;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('GET /personas', () => {
    it('should return empty array when no personas exist', async () => {
      const res = await app.request('/personas');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ personas: [] });
    });

    it('should return all persona schemas', async () => {
      await schemaRepo.savePersonaSchema({
        name: 'Persona One',
        description: 'First persona',
        version: 1,
        config: validPersonaConfig,
        isActive: true,
      });
      await schemaRepo.savePersonaSchema({
        name: 'Persona Two',
        version: 1,
        config: { ...validPersonaConfig, name: 'Persona Two' },
        isActive: false,
      });

      const res = await app.request('/personas');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { personas: Record<string, unknown>[] };
      expect(body.personas).toHaveLength(2);
      expect(body.personas[0]).toHaveProperty('personaSchemaId');
      expect(body.personas[0]).toHaveProperty('name');
      expect(body.personas[0]).toHaveProperty('createdAt');
    });

    it('should include description in summary when present', async () => {
      await schemaRepo.savePersonaSchema({
        name: 'Described Persona',
        description: 'A persona with a description',
        version: 1,
        config: validPersonaConfig,
        isActive: true,
      });

      const res = await app.request('/personas');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { personas: Record<string, unknown>[] };
      expect(body.personas[0]).toHaveProperty('description', 'A persona with a description');
    });
  });

  describe('POST /personas', () => {
    it('should create a new persona schema', async () => {
      const res = await app.request(
        '/personas',
        jsonPost({
          name: 'New Persona',
          description: 'A brand new persona',
          config: validPersonaConfig,
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('personaSchemaId');
      expect(body).toHaveProperty('name', 'New Persona');
      expect(body).toHaveProperty('isActive', true);
      expect(body).toHaveProperty('createdAt');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await app.request(
        '/personas',
        jsonPost({
          name: 'Bad Persona',
          config: {
            name: 'Bad',
            // missing required fields: version, tonality, formality, language, promptBehavior, systemPromptTemplate
          },
        }),
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 when name is empty', async () => {
      const res = await app.request(
        '/personas',
        jsonPost({
          name: '',
          config: validPersonaConfig,
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /personas/{personaSchemaId}', () => {
    it('should return full persona schema details', async () => {
      const saved = await schemaRepo.savePersonaSchema({
        name: 'Detail Persona',
        description: 'For detail test',
        version: 1,
        config: validPersonaConfig,
        isActive: true,
      });

      const res = await app.request(`/personas/${saved.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('personaSchemaId', saved.id);
      expect(body).toHaveProperty('name', 'Detail Persona');
      expect(body).toHaveProperty('description', 'For detail test');
      expect(body).toHaveProperty('config');
      expect(body).toHaveProperty('version', 1);
      expect(body).toHaveProperty('isActive', true);
    });

    it('should return 404 for non-existent persona', async () => {
      const res = await app.request('/personas/non-existent-id');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'PERSONA_NOT_FOUND');
    });
  });

  describe('PUT /personas/{personaSchemaId}', () => {
    it('should update persona name and description', async () => {
      const saved = await schemaRepo.savePersonaSchema({
        name: 'Original Name',
        version: 1,
        config: validPersonaConfig,
        isActive: true,
      });

      const res = await app.request(
        `/personas/${saved.id}`,
        jsonPut({
          name: 'Updated Name',
          description: 'Now with a description',
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('name', 'Updated Name');
      expect(body).toHaveProperty('description', 'Now with a description');
      expect(body).toHaveProperty('version', 2);
    });

    it('should update persona config', async () => {
      const saved = await schemaRepo.savePersonaSchema({
        name: 'Config Persona',
        version: 1,
        config: validPersonaConfig,
        isActive: true,
      });

      const updatedConfig = { ...validPersonaConfig, tonality: 'formal and reserved' };
      const res = await app.request(
        `/personas/${saved.id}`,
        jsonPut({ config: updatedConfig }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(body.config).toHaveProperty('tonality', 'formal and reserved');
    });

    it('should return 404 for non-existent persona', async () => {
      const res = await app.request(
        '/personas/non-existent-id',
        jsonPut({ name: 'Updated' }),
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'PERSONA_NOT_FOUND');
    });
  });

  describe('DELETE /personas/{personaSchemaId}', () => {
    it('should hard-delete persona and return success', async () => {
      const saved = await schemaRepo.savePersonaSchema({
        name: 'To Delete',
        version: 1,
        config: validPersonaConfig,
        isActive: true,
      });

      const res = await app.request(`/personas/${saved.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ success: true });

      // Verify it's actually deleted
      const check = await schemaRepo.getPersonaSchema(saved.id);
      expect(check).toBeNull();
    });

    it('should return 404 for non-existent persona', async () => {
      const res = await app.request('/personas/non-existent-id', { method: 'DELETE' });
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'PERSONA_NOT_FOUND');
    });
  });
});
