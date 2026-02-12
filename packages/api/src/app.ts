import type { Firestore } from '@google-cloud/firestore';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import { createRouter, type AppEnv } from './types.js';
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

export function createApp(config: AppConfig): OpenAPIHono<AppEnv> {
  const app = createRouter();

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

  // OpenAPI spec — no auth required
  app.get('/openapi.json', (c) => {
    const spec = app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        title: 'Mycel API',
        version: '1.0.0',
        description: 'AI-powered Universal Knowledge Engine API',
      },
      security: [{ Bearer: [] }],
    });
    spec.components = {
      ...spec.components,
      securitySchemes: {
        Bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    };
    return c.json(spec);
  });

  // Scalar API Reference — no auth required (loads client-side from CDN)
  app.get('/docs', (c) => {
    const html = `<!doctype html>
<html>
<head>
  <title>Mycel API Reference</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/openapi.json" data-configuration='${JSON.stringify({ theme: 'kepler' })}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
    return c.html(html);
  });

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
