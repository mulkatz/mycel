import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../types.js';
import { HealthResponseSchema } from '../schemas/responses.js';

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Health check',
  security: [],
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

const health = createRouter();

health.openapi(healthRoute, (c) => {
  return c.json({ status: 'ok', version: '0.1.0' }, 200);
});

export { health };
