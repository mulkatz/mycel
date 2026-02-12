import type { Context } from 'hono';
import { ZodError } from 'zod';
import { errors as joseErrors } from 'jose';
import { SessionError, LlmError, PersistenceError, SchemaGenerationError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import type { AppEnv } from '../types.js';

const log = createChildLogger('api:error-handler');

interface ErrorResponse {
  readonly error: string;
  readonly code: string;
  readonly requestId: string;
  readonly details?: readonly string[];
}

export function errorHandler(err: Error, c: Context<AppEnv>): Response {
  const requestId = c.get('requestId');

  if (
    err instanceof joseErrors.JWTExpired ||
    err instanceof joseErrors.JWTClaimValidationFailed ||
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JWTInvalid ||
    err instanceof joseErrors.JOSEError
  ) {
    const body: ErrorResponse = {
      error: 'Invalid or expired token',
      code: 'UNAUTHORIZED',
      requestId,
    };
    return c.json(body, 401);
  }

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    const body: ErrorResponse = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      requestId,
      details,
    };
    return c.json(body, 400);
  }

  if (err instanceof SessionError) {
    if (err.message.includes('not found')) {
      const body: ErrorResponse = {
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
        requestId,
      };
      return c.json(body, 404);
    }

    if (err.message.includes('already')) {
      const body: ErrorResponse = {
        error: 'Session is completed',
        code: 'SESSION_COMPLETED',
        requestId,
      };
      return c.json(body, 409);
    }

    log.error({ requestId, error: err.message }, 'Session error');
    const body: ErrorResponse = {
      error: 'Session error',
      code: 'SESSION_ERROR',
      requestId,
    };
    return c.json(body, 400);
  }

  if (err instanceof SchemaGenerationError) {
    const statusCode = err.message.includes('not found') ? 404 : 400;
    log.error({ requestId, error: err.message }, 'Schema generation error');
    const body: ErrorResponse = {
      error: err.message,
      code: 'SCHEMA_GENERATION_ERROR',
      requestId,
    };
    return c.json(body, statusCode);
  }

  if (err instanceof LlmError) {
    log.error({ requestId, error: err.message }, 'LLM error');
    const body: ErrorResponse = {
      error: 'Language model processing failed',
      code: 'LLM_ERROR',
      requestId,
    };
    return c.json(body, 502);
  }

  if (err instanceof PersistenceError) {
    log.error({ requestId, error: err.message }, 'Persistence error');
    const body: ErrorResponse = {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    };
    return c.json(body, 500);
  }

  log.error({ requestId, error: err.message }, 'Unhandled error');
  const body: ErrorResponse = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
  };
  return c.json(body, 500);
}
