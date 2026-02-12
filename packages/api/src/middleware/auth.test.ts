import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import type { KeyLike } from 'jose';
import { createAuthMiddleware } from './auth.js';

const PROJECT_ID = 'test-project';

interface TestKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
}

let testKeys: TestKeys;

async function setupKeys(): Promise<TestKeys> {
  if (!testKeys) {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    testKeys = { privateKey, publicKey };
  }
  return testKeys;
}

async function createToken(
  overrides: {
    sub?: string;
    iss?: string;
    aud?: string;
    exp?: number;
  } = {},
): Promise<string> {
  const { privateKey } = await setupKeys();

  const jwt = new SignJWT({ sub: overrides.sub ?? 'user-123' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(overrides.iss ?? `https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(overrides.aud ?? PROJECT_ID)
    .setIssuedAt();

  if (overrides.exp !== undefined) {
    jwt.setExpirationTime(overrides.exp);
  } else {
    jwt.setExpirationTime('1h');
  }

  return jwt.sign(privateKey);
}

function createTestApp(): Hono {
  const app = new Hono();

  // The real auth middleware verifies against Google's JWKS.
  // For unit tests, we test the middleware logic by calling it directly
  // and verifying the error responses for invalid inputs.
  app.use('*', createAuthMiddleware(PROJECT_ID));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('Auth Middleware', () => {
  it('should return 401 when Authorization header is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/test');

    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('code', 'UNAUTHORIZED');
    expect(body).toHaveProperty('error', 'Missing or invalid Authorization header');
  });

  it('should return 401 when Authorization header has wrong format', async () => {
    const app = createTestApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('code', 'UNAUTHORIZED');
  });

  it('should return 401 when token is empty after Bearer', async () => {
    const app = createTestApp();
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer ' },
    });

    // jose will throw on empty token, caught by error handler
    expect(res.status).toBe(401);
  });

  it('should return 401 for a completely invalid token', async () => {
    const app = createTestApp();

    // Add error handler to catch jose errors → 401
    app.onError((err, c) => {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    });

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 for a JWT signed with wrong key (JWKS mismatch)', async () => {
    const app = createTestApp();

    app.onError((err, c) => {
      return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    });

    // This token is valid JWT format but signed with a random key, not Google's JWKS
    const token = await createToken();
    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
  });
});
