import { Hono } from 'hono';
import type { SessionRepository } from '@mycel/core/src/repositories/session.repository.js';
import type { KnowledgeRepository } from '@mycel/core/src/repositories/knowledge.repository.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import type { LlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createSessionManager } from '@mycel/core/src/session/session-manager.js';
import { SessionError } from '@mycel/shared/src/utils/errors.js';
import type { AppEnv } from '../types.js';
import { CreateSessionSchema, CreateTurnSchema } from '../schemas/requests.js';

export interface SessionRouteDeps {
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly llmClient: LlmClient;
}

export function createSessionRoutes(deps: SessionRouteDeps): Hono<AppEnv> {
  const sessions = new Hono<AppEnv>();

  sessions.post('/', async (c) => {
    const body = CreateSessionSchema.parse(await c.req.json());

    const domainSchema = await deps.schemaRepository.getDomainSchemaByName(body.domainSchemaId);
    if (!domainSchema) {
      return c.json(
        {
          error: `Domain schema not found: ${body.domainSchemaId}`,
          code: 'SCHEMA_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    const personaSchema = await deps.schemaRepository.getPersonaSchemaByName(body.personaSchemaId);
    if (!personaSchema) {
      return c.json(
        {
          error: `Persona schema not found: ${body.personaSchemaId}`,
          code: 'SCHEMA_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    const sessionManager = createSessionManager({
      pipelineConfig: {
        domainConfig: domainSchema.config,
        personaConfig: personaSchema.config,
        llmClient: deps.llmClient,
      },
      sessionRepository: deps.sessionRepository,
      knowledgeRepository: deps.knowledgeRepository,
    });

    const result = await sessionManager.initSession({ source: 'api' });

    return c.json(
      {
        sessionId: result.sessionId,
        status: 'active',
        greeting: result.greeting,
      },
      201,
    );
  });

  sessions.post('/:sessionId/turns', async (c) => {
    const { sessionId } = c.req.param();
    const body = CreateTurnSchema.parse(await c.req.json());

    const session = await deps.sessionRepository.getSessionWithTurns(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new SessionError(`Session is already ${session.status}: ${sessionId}`);
    }

    const domainSchema = await deps.schemaRepository.getDomainSchemaByName(
      session.domainConfigName,
    );
    const personaSchema = await deps.schemaRepository.getPersonaSchemaByName(
      session.personaConfigName,
    );

    if (!domainSchema || !personaSchema) {
      throw new SessionError(`Schema configuration not found for session: ${sessionId}`);
    }

    const sessionManager = createSessionManager({
      pipelineConfig: {
        domainConfig: domainSchema.config,
        personaConfig: personaSchema.config,
        llmClient: deps.llmClient,
      },
      sessionRepository: deps.sessionRepository,
      knowledgeRepository: deps.knowledgeRepository,
    });

    const isFollowUp = session.turns.length > 0;

    const response = await sessionManager.continueSession(sessionId, {
      content: body.userInput,
      isFollowUpResponse: isFollowUp,
    });

    return c.json({
      sessionId,
      turnIndex: response.turnNumber,
      response: response.personaResponse,
      knowledgeExtracted: !!response.entry,
      status: 'active',
    });
  });

  sessions.get('/:sessionId', async (c) => {
    const { sessionId } = c.req.param();

    const session = await deps.sessionRepository.getSessionWithTurns(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }

    const entries = await deps.knowledgeRepository.getBySession(sessionId);

    return c.json({
      sessionId: session.id,
      status: session.status,
      turnCount: session.turnCount,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      knowledgeEntryCount: entries.length,
    });
  });

  sessions.post('/:sessionId/end', async (c) => {
    const { sessionId } = c.req.param();

    const session = await deps.sessionRepository.getSessionWithTurns(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }

    const domainSchema = await deps.schemaRepository.getDomainSchemaByName(
      session.domainConfigName,
    );
    const personaSchema = await deps.schemaRepository.getPersonaSchemaByName(
      session.personaConfigName,
    );

    if (!domainSchema || !personaSchema) {
      throw new SessionError(`Schema configuration not found for session: ${sessionId}`);
    }

    const sessionManager = createSessionManager({
      pipelineConfig: {
        domainConfig: domainSchema.config,
        personaConfig: personaSchema.config,
        llmClient: deps.llmClient,
      },
      sessionRepository: deps.sessionRepository,
      knowledgeRepository: deps.knowledgeRepository,
    });

    const ended = await sessionManager.endSession(sessionId);
    const entries = await deps.knowledgeRepository.getBySession(sessionId);

    return c.json({
      sessionId: ended.id,
      status: ended.status,
      turnCount: ended.turnCount,
      knowledgeEntryCount: entries.length,
      summary: `Session ended. ${String(entries.length)} knowledge ${entries.length === 1 ? 'entry' : 'entries'} captured.`,
    });
  });

  return sessions;
}
