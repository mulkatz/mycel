import type { Firestore } from '@google-cloud/firestore';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { AppEnv } from './types.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createTenantReposMiddleware } from './middleware/tenant-repos.js';
import { health } from './routes/health.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createDocumentRoutes } from './routes/documents.js';
import { createSchemaGeneratorRoutes } from './routes/schema-generator.js';
import { createEvolutionRoutes } from './routes/evolution.js';
import { createEntryRoutes } from './routes/entries.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('api:server');

export interface AppConfig {
  readonly db: Firestore;
  readonly projectId: string;
  readonly sharedDeps: SharedDeps;
}

export function createApp(config: AppConfig): Hono<AppEnv> {
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

  // Health — no auth required
  app.route('/health', health);

  // Auth middleware — applies to all routes below
  app.use('*', createAuthMiddleware(config.projectId));

  // Tenant repos middleware — creates per-request repos
  app.use('*', createTenantReposMiddleware(config.db, config.sharedDeps));

  // Routes — repos come from context via tenantRepos
  app.route('/sessions', createSessionRoutes(config.sharedDeps));
  app.route('/domains', createDocumentRoutes());
  app.route('/domains', createSchemaGeneratorRoutes());
  app.route('/domains', createEvolutionRoutes());
  app.route('/entries', createEntryRoutes());

  return app;
}
