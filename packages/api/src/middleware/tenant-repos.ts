import type { Firestore } from '@google-cloud/firestore';
import { createMiddleware } from 'hono/factory';
import { createTenantRepositories } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { SharedDeps } from '@mycel/core/src/infrastructure/tenant-repositories.js';
import type { AppEnv } from '../types.js';

export function createTenantReposMiddleware(
  db: Firestore,
  sharedDeps: SharedDeps,
): ReturnType<typeof createMiddleware<AppEnv>> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const tenantId = c.get('tenantId');
    const repos = createTenantRepositories(db, tenantId, sharedDeps);
    c.set('tenantRepos', repos);
    await next();
  });
}
