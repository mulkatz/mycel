import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import { createSessionManager } from '@mycel/core/src/session/session-manager.js';
import { SessionError } from '@mycel/shared/src/utils/errors.js';
import { createRouter, type AppEnv } from '../types.js';
import { CreateSessionSchema, CreateTurnSchema, ListSessionsQuerySchema } from '../schemas/requests.js';
import {
  ErrorResponseSchema,
  CreateSessionResponseSchema,
  TurnResponseSchema,
  SessionDetailResponseSchema,
  EndSessionResponseSchema,
  SessionListResponseSchema,
  SessionTurnsResponseSchema,
} from '../schemas/responses.js';

const SessionIdParamSchema = z.object({
  sessionId: z.string().min(1),
});

const listSessionsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Sessions'],
  summary: 'List sessions',
  request: {
    query: ListSessionsQuerySchema,
  },
  responses: {
    200: {
      description: 'Session list',
      content: {
        'application/json': {
          schema: SessionListResponseSchema,
        },
      },
    },
  },
});

const getSessionTurnsRoute = createRoute({
  method: 'get',
  path: '/{sessionId}/turns',
  tags: ['Sessions'],
  summary: 'Get session turn history',
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: 'Turn history',
      content: {
        'application/json': {
          schema: SessionTurnsResponseSchema,
        },
      },
    },
    404: {
      description: 'Session not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const createSessionRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Sessions'],
  summary: 'Create a new session',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateSessionSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Session created',
      content: {
        'application/json': {
          schema: CreateSessionResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Schema not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const createTurnRoute = createRoute({
  method: 'post',
  path: '/{sessionId}/turns',
  tags: ['Sessions'],
  summary: 'Submit a turn in a session',
  request: {
    params: SessionIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CreateTurnSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Turn response',
      content: {
        'application/json': {
          schema: TurnResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Session not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getSessionRoute = createRoute({
  method: 'get',
  path: '/{sessionId}',
  tags: ['Sessions'],
  summary: 'Get session details',
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: 'Session details',
      content: {
        'application/json': {
          schema: SessionDetailResponseSchema,
        },
      },
    },
    404: {
      description: 'Session not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const endSessionRoute = createRoute({
  method: 'post',
  path: '/{sessionId}/end',
  tags: ['Sessions'],
  summary: 'End a session',
  request: {
    params: SessionIdParamSchema,
  },
  responses: {
    200: {
      description: 'Session ended',
      content: {
        'application/json': {
          schema: EndSessionResponseSchema,
        },
      },
    },
    404: {
      description: 'Session not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createSessionRoutes(shared: SharedDeps): OpenAPIHono<AppEnv> {
  const sessions = createRouter();

  sessions.openapi(listSessionsRoute, async (c) => {
    const query = c.req.valid('query');
    const { sessionRepository } = c.get('tenantRepos');

    const results = await sessionRepository.list({
      limit: query.limit,
      status: query.status,
    });

    return c.json(
      {
        sessions: results.map((s) => ({
          sessionId: s.id,
          status: s.status,
          domainSchemaId: s.domainConfigName,
          personaSchemaId: s.personaConfigName,
          turnCount: s.turnCount,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      },
      200,
    );
  });

  sessions.openapi(getSessionTurnsRoute, async (c) => {
    const { sessionId } = c.req.valid('param');
    const { sessionRepository } = c.get('tenantRepos');

    const session = await sessionRepository.getById(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }

    const turns = await sessionRepository.getTurns(sessionId);

    return c.json(
      {
        sessionId,
        turns: turns.map((t) => ({
          turnNumber: t.turnNumber,
          userInput: t.input.content,
          response: t.pipelineResult.personaOutput?.result.response ?? '',
          followUpQuestions: [...(t.pipelineResult.personaOutput?.result.followUpQuestions ?? [])],
          knowledgeExtracted: !!t.pipelineResult.structuringOutput,
          timestamp: t.timestamp.toISOString(),
        })),
      },
      200,
    );
  });

  sessions.openapi(createSessionRoute, async (c) => {
    const body = c.req.valid('json');
    const { sessionRepository, knowledgeRepository, schemaRepository, fieldStatsRepository } =
      c.get('tenantRepos');

    const domainSchema =
      (await schemaRepository.getDomainSchemaByName(body.domainSchemaId)) ??
      (await schemaRepository.getDomainSchema(body.domainSchemaId));
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

    const personaSchema =
      (await schemaRepository.getPersonaSchemaByName(body.personaSchemaId)) ??
      (await schemaRepository.getPersonaSchema(body.personaSchemaId));
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
        llmClient: shared.llmClient,
      },
      sessionRepository,
      knowledgeRepository,
      embeddingClient: shared.embeddingClient,
      fieldStatsRepository,
    });

    const result = await sessionManager.initSession({ source: 'api' });

    return c.json(
      {
        sessionId: result.sessionId,
        status: 'active' as const,
        greeting: result.greeting,
      },
      201,
    );
  });

  sessions.openapi(createTurnRoute, async (c) => {
    const { sessionId } = c.req.valid('param');
    const body = c.req.valid('json');
    const { sessionRepository, knowledgeRepository, schemaRepository, fieldStatsRepository, enrichmentOrchestrator } =
      c.get('tenantRepos');

    const session = await sessionRepository.getSessionWithTurns(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new SessionError(`Session is already ${session.status}: ${sessionId}`);
    }

    const domainSchema = await schemaRepository.getDomainSchemaByName(
      session.domainConfigName,
    );
    const personaSchema = await schemaRepository.getPersonaSchemaByName(
      session.personaConfigName,
    );

    if (!domainSchema || !personaSchema) {
      throw new SessionError(`Schema configuration not found for session: ${sessionId}`);
    }

    const webSearch = domainSchema.behavior.webSearch;
    const enableEnrichment = webSearch === 'enrichment' || webSearch === 'full';

    const sessionManager = createSessionManager({
      pipelineConfig: {
        domainConfig: domainSchema.config,
        personaConfig: personaSchema.config,
        llmClient: shared.llmClient,
      },
      sessionRepository,
      knowledgeRepository,
      embeddingClient: shared.embeddingClient,
      fieldStatsRepository,
      enrichmentOrchestrator: enableEnrichment ? enrichmentOrchestrator : undefined,
    });

    const isFollowUp = session.turns.length > 0;

    const response = await sessionManager.continueSession(sessionId, {
      content: body.userInput,
      isFollowUpResponse: isFollowUp,
    });

    return c.json(
      {
        sessionId,
        turnIndex: response.turnNumber,
        response: response.personaResponse,
        knowledgeExtracted: !!response.entry,
        status: 'active',
      },
      200,
    );
  });

  sessions.openapi(getSessionRoute, async (c) => {
    const { sessionId } = c.req.valid('param');
    const { sessionRepository, knowledgeRepository } = c.get('tenantRepos');

    const session = await sessionRepository.getSessionWithTurns(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }

    const entries = await knowledgeRepository.getBySession(sessionId);

    return c.json(
      {
        sessionId: session.id,
        status: session.status,
        turnCount: session.turnCount,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        knowledgeEntryCount: entries.length,
      },
      200,
    );
  });

  sessions.openapi(endSessionRoute, async (c) => {
    const { sessionId } = c.req.valid('param');
    const { sessionRepository, knowledgeRepository, schemaRepository, fieldStatsRepository } =
      c.get('tenantRepos');

    const session = await sessionRepository.getSessionWithTurns(sessionId);
    if (!session) {
      throw new SessionError(`Session not found: ${sessionId}`);
    }

    const domainSchema = await schemaRepository.getDomainSchemaByName(
      session.domainConfigName,
    );
    const personaSchema = await schemaRepository.getPersonaSchemaByName(
      session.personaConfigName,
    );

    if (!domainSchema || !personaSchema) {
      throw new SessionError(`Schema configuration not found for session: ${sessionId}`);
    }

    const sessionManager = createSessionManager({
      pipelineConfig: {
        domainConfig: domainSchema.config,
        personaConfig: personaSchema.config,
        llmClient: shared.llmClient,
      },
      sessionRepository,
      knowledgeRepository,
      embeddingClient: shared.embeddingClient,
      fieldStatsRepository,
    });

    const ended = await sessionManager.endSession(sessionId);
    const entries = await knowledgeRepository.getBySession(sessionId);

    return c.json(
      {
        sessionId: ended.id,
        status: ended.status,
        turnCount: ended.turnCount,
        knowledgeEntryCount: entries.length,
        summary: `Session ended. ${String(entries.length)} knowledge ${entries.length === 1 ? 'entry' : 'entries'} captured.`,
      },
      200,
    );
  });

  return sessions;
}
