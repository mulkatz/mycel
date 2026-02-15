import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { LlmClient } from '@mycel/core/src/llm/llm-client.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '@mycel/core/src/repositories/in-memory-schema.repository.js';
import type { TenantRepositories, SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import { createTestApp } from '../test-helpers.js';
import type { AppEnv } from '../types.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Test domain',
  categories: [
    {
      id: 'history',
      label: 'History',
      description: 'Historical events',
      requiredFields: ['period', 'sources'],
    },
    { id: 'nature', label: 'Nature', description: 'Natural environment' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'en',
    supportedLanguages: ['en'],
  },
  completeness: {
    autoCompleteThreshold: 0.8,
    maxTurns: 3,
  },
};

const personaConfig: PersonaConfig = {
  name: 'test-persona',
  version: '1.0.0',
  tonality: 'warm',
  formality: 'informal',
  language: 'en',
  promptBehavior: {
    gapAnalysis: true,
    maxFollowUpQuestions: 3,
    encourageStorytelling: false,
    validateWithSources: true,
  },
  systemPromptTemplate: 'You are a test chronicler.',
};

function createMockLlm(): LlmClient {
  return {
    invoke: vi.fn().mockImplementation((request: { systemPrompt: string; userMessage: string }) => {
      const prompt = request.systemPrompt.toLowerCase();
      const isFollowUp = prompt.includes('[follow_up_context]');

      // Greeting
      if (prompt.includes('starting a new conversation') && prompt.includes('your persona')) {
        return Promise.resolve({
          content: JSON.stringify({
            response: 'Hello! What can you tell me about your community?',
            followUpQuestions: [],
          }),
        });
      }

      // Classifier
      if (prompt.includes('classifier')) {
        return Promise.resolve({
          content: JSON.stringify({
            categoryId: 'history',
            confidence: 0.9,
            intent: 'content',
            isTopicChange: false,
            reasoning: 'Historical content.',
          }),
        });
      }

      // Gap reasoning
      if (prompt.includes('gap-reasoning') || prompt.includes('gap analysis')) {
        if (isFollowUp) {
          return Promise.resolve({
            content: JSON.stringify({
              gaps: [],
              followUpQuestions: [],
              reasoning: 'All filled.',
            }),
          });
        }
        return Promise.resolve({
          content: JSON.stringify({
            gaps: [{ field: 'period', description: 'Period unclear', priority: 'high' }],
            followUpQuestions: ['When was this?'],
            reasoning: 'Missing period.',
          }),
        });
      }

      // Persona
      if (prompt.includes('your persona')) {
        return Promise.resolve({
          content: JSON.stringify({
            response: 'Interesting! When exactly was this?',
            followUpQuestions: ['When was this?'],
          }),
        });
      }

      // Structuring
      if (prompt.includes('structuring')) {
        return Promise.resolve({
          content: JSON.stringify({
            title: 'Test Entry',
            content: 'A test knowledge entry.',
            structuredData: {},
            tags: ['history'],
            isComplete: false,
            missingFields: ['period'],
          }),
        });
      }

      return Promise.resolve({ content: JSON.stringify({ result: 'unknown' }) });
    }),
  };
}

async function seedSchemaRepo(schemaRepo: SchemaRepository): Promise<{ domainId: string }> {
  const domain = await schemaRepo.saveDomainSchema({
    name: domainConfig.name,
    version: 1,
    config: domainConfig,
    isActive: true,
  });
  await schemaRepo.savePersonaSchema({
    name: personaConfig.name,
    version: 1,
    config: personaConfig,
    isActive: true,
  });
  return { domainId: domain.id };
}

function jsonPost(path: string, body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('API Routes', () => {
  let app: OpenAPIHono<AppEnv>;
  let schemaRepo: SchemaRepository;
  let domainDocId: string;

  beforeEach(async () => {
    schemaRepo = createInMemorySchemaRepository();
    const { domainId } = await seedSchemaRepo(schemaRepo);
    domainDocId = domainId;

    const llmClient = createMockLlm();

    const tenantRepos = {
      sessionRepository: createInMemorySessionRepository(),
      knowledgeRepository: createInMemoryKnowledgeRepository(),
      schemaRepository: schemaRepo,
    } as TenantRepositories;

    const sharedDeps = { llmClient } as SharedDeps;

    app = createTestApp(tenantRepos, sharedDeps);
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ status: 'ok', version: '0.1.0' });
    });
  });

  describe('POST /sessions', () => {
    it('should create a session and return greeting', async () => {
      const res = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('greeting');
      expect(body).toHaveProperty('status', 'active');
      expect(typeof body['greeting']).toBe('string');
      expect((body['greeting'] as string).length).toBeGreaterThan(0);
    });

    it('should return 404 for unknown domain schema', async () => {
      const res = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'nonexistent',
          personaSchemaId: 'test-persona',
        }),
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SCHEMA_NOT_FOUND');
    });

    it('should return 404 for unknown persona schema', async () => {
      const res = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'nonexistent',
        }),
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SCHEMA_NOT_FOUND');
    });

    it('should return 400 for invalid request body', async () => {
      const res = await app.request('/sessions', jsonPost('/sessions', { domainSchemaId: '' }));
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('POST /sessions/:sessionId/turns', () => {
    it('should submit a turn and return response', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      const turnRes = await app.request(
        `/sessions/${sessionId}/turns`,
        jsonPost(`/sessions/${sessionId}/turns`, {
          userInput: 'The old church was built in 1732.',
        }),
      );
      expect(turnRes.status).toBe(200);
      const body = (await turnRes.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('sessionId', sessionId);
      expect(body).toHaveProperty('turnIndex', 1);
      expect(body).toHaveProperty('response');
      expect(body).toHaveProperty('knowledgeExtracted', true);
      expect(body).toHaveProperty('status', 'active');
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await app.request(
        '/sessions/nonexistent/turns',
        jsonPost('/sessions/nonexistent/turns', {
          userInput: 'Hello',
        }),
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });

    it('should return 409 for completed session', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      // End the session
      await app.request(`/sessions/${sessionId}/end`, { method: 'POST' });

      // Try to add a turn
      const turnRes = await app.request(
        `/sessions/${sessionId}/turns`,
        jsonPost(`/sessions/${sessionId}/turns`, {
          userInput: 'Hello',
        }),
      );
      expect(turnRes.status).toBe(409);
      const body = (await turnRes.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SESSION_COMPLETED');
    });

    it('should return 400 for empty userInput', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      const turnRes = await app.request(
        `/sessions/${sessionId}/turns`,
        jsonPost(`/sessions/${sessionId}/turns`, {
          userInput: '',
        }),
      );
      expect(turnRes.status).toBe(400);
    });
  });

  describe('GET /sessions/:sessionId', () => {
    it('should return session status and counts', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      const res = await app.request(`/sessions/${sessionId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('sessionId', sessionId);
      expect(body).toHaveProperty('status', 'active');
      expect(body).toHaveProperty('turnCount', 0);
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
      expect(body).toHaveProperty('knowledgeEntryCount', 0);
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await app.request('/sessions/nonexistent');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });
  });

  describe('GET /sessions', () => {
    it('should return empty list when no sessions exist', async () => {
      const res = await app.request('/sessions');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: unknown[] };
      expect(body.sessions).toEqual([]);
    });

    it('should return created sessions', async () => {
      await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );

      const res = await app.request('/sessions');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: Record<string, unknown>[] };
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0]).toHaveProperty('sessionId');
      expect(body.sessions[0]).toHaveProperty('status', 'active');
      expect(body.sessions[0]).toHaveProperty('domainSchemaId', domainDocId);
      expect(body.sessions[0]).toHaveProperty('personaSchemaId', 'test-persona');
      expect(body.sessions[0]).toHaveProperty('turnCount', 0);
      expect(body.sessions[0]).toHaveProperty('createdAt');
      expect(body.sessions[0]).toHaveProperty('updatedAt');
    });

    it('should filter by status', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      // Create a second session
      await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );

      // End the first session
      await app.request(`/sessions/${sessionId}/end`, { method: 'POST' });

      const activeRes = await app.request('/sessions?status=active');
      const activeBody = (await activeRes.json()) as { sessions: Record<string, unknown>[] };
      expect(activeBody.sessions).toHaveLength(1);
      expect(activeBody.sessions[0]).toHaveProperty('status', 'active');
    });
  });

  describe('GET /sessions/:sessionId/turns', () => {
    it('should return turns for a session', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      await app.request(
        `/sessions/${sessionId}/turns`,
        jsonPost(`/sessions/${sessionId}/turns`, {
          userInput: 'The old church was built in 1732.',
        }),
      );

      const res = await app.request(`/sessions/${sessionId}/turns`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessionId: string; turns: Record<string, unknown>[] };
      expect(body.sessionId).toBe(sessionId);
      expect(body.turns).toHaveLength(1);
      expect(body.turns[0]).toHaveProperty('turnNumber', 1);
      expect(body.turns[0]).toHaveProperty('userInput');
      expect(body.turns[0]).toHaveProperty('response');
      expect(body.turns[0]).toHaveProperty('followUpQuestions');
      expect(body.turns[0]).toHaveProperty('knowledgeExtracted');
      expect(body.turns[0]).toHaveProperty('timestamp');
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await app.request('/sessions/nonexistent/turns');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });

    it('should return empty turns for session with no turns', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      const res = await app.request(`/sessions/${sessionId}/turns`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessionId: string; turns: unknown[] };
      expect(body.turns).toEqual([]);
    });
  });

  describe('POST /sessions/:sessionId/end', () => {
    it('should end session and return summary', async () => {
      const createRes = await app.request(
        '/sessions',
        jsonPost('/sessions', {
          domainSchemaId: 'test-domain',
          personaSchemaId: 'test-persona',
        }),
      );
      const { sessionId } = (await createRes.json()) as { sessionId: string };

      const res = await app.request(`/sessions/${sessionId}/end`, { method: 'POST' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('sessionId', sessionId);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('knowledgeEntryCount');
      expect(body).toHaveProperty('summary');
    });

    it('should return 404 for nonexistent session', async () => {
      const res = await app.request('/sessions/nonexistent/end', { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const res = await app.request('/health', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  describe('Request ID', () => {
    it('should include X-Request-Id header', async () => {
      const res = await app.request('/health');
      const requestId = res.headers.get('x-request-id');
      expect(requestId).toBeTruthy();
      expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });
});
