import type { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { TenantRepositories } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import { createRouter, type AppEnv } from './types.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { health } from './routes/health.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createDocumentRoutes } from './routes/documents.js';
import { createSchemaGeneratorRoutes } from './routes/schema-generator.js';
import { createEvolutionRoutes } from './routes/evolution.js';
import { createEntryRoutes } from './routes/entries.js';
import { createDomainAdminRoutes } from './routes/domain-admin.js';
import { createPersonaRoutes } from './routes/personas.js';
import type { SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';

/**
 * Creates a test app that bypasses JWT auth and uses provided tenant repos directly.
 * For use in unit tests only.
 */
export function createTestApp(
  tenantRepos: TenantRepositories,
  sharedDeps: SharedDeps,
): OpenAPIHono<AppEnv> {
  const app = createRouter();

  app.use('*', cors());
  app.use('*', requestId);

  app.onError(errorHandler);

  app.route('/health', health);

  // Mock auth: set fixed tenantId and provided tenant repos
  app.use('*', async (c, next) => {
    c.set('tenantId', 'test-tenant');
    c.set('tenantRepos', tenantRepos);
    await next();
  });

  app.route('/sessions', createSessionRoutes(sharedDeps));
  app.route('/domains', createDocumentRoutes());
  app.route('/domains', createSchemaGeneratorRoutes());
  app.route('/domains', createEvolutionRoutes());
  app.route('/domains', createDomainAdminRoutes());
  app.route('/personas', createPersonaRoutes());
  app.route('/entries', createEntryRoutes());

  return app;
}
