import { OpenAPIHono } from '@hono/zod-openapi';
import type { TenantRepositories } from '@mycel/core/src/infrastructure/tenant-repositories.js';

export interface AppEnv {
  Variables: {
    requestId: string;
    tenantId: string;
    tenantRepos: TenantRepositories;
  };
}

export function createRouter(): OpenAPIHono<AppEnv> {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c): Response | undefined => {
      if (!result.success) {
        const details = result.error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`,
        );
        return c.json(
          {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            requestId: c.get('requestId'),
            details,
          },
          400,
        );
      }
    },
  });
}
