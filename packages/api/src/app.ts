import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SessionRepository } from '@mycel/core/src/repositories/session.repository.js';
import type { KnowledgeRepository } from '@mycel/core/src/repositories/knowledge.repository.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import type { LlmClient } from '@mycel/core/src/llm/llm-client.js';
import type { AppEnv } from './types.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { health } from './routes/health.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('api:server');

export interface AppDependencies {
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly llmClient: LlmClient;
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', cors());
  app.use('*', requestId);

  // Request logging
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration,
        requestId: c.get('requestId'),
      },
      'Request completed',
    );
  });

  app.onError(errorHandler);

  app.route('/health', health);
  app.route('/sessions', createSessionRoutes(deps));

  return app;
}
