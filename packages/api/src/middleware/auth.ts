import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export function createAuthMiddleware(projectId: string): ReturnType<typeof createMiddleware<AppEnv>> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        { error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' },
        401,
      );
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    if (!payload.sub) {
      return c.json({ error: 'Token missing sub claim', code: 'UNAUTHORIZED' }, 401);
    }

    c.set('tenantId', payload.sub);
    await next();
  });
}
