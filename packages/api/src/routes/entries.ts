import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRouter, type AppEnv } from '../types.js';
import {
  ErrorResponseSchema,
  EntryEnrichmentResponseSchema,
} from '../schemas/responses.js';

const getEnrichmentRoute = createRoute({
  method: 'get',
  path: '/{entryId}/enrichment',
  tags: ['Entries'],
  summary: 'Get entry enrichment data',
  request: {
    params: z.object({
      entryId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Entry enrichment data',
      content: {
        'application/json': {
          schema: EntryEnrichmentResponseSchema,
        },
      },
    },
    404: {
      description: 'Entry not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createEntryRoutes(): OpenAPIHono<AppEnv> {
  const routes = createRouter();

  routes.openapi(getEnrichmentRoute, async (c) => {
    const { entryId } = c.req.valid('param');
    const { knowledgeRepository } = c.get('tenantRepos');

    const entry = await knowledgeRepository.getById(entryId);
    if (!entry) {
      return c.json(
        {
          error: `Entry not found: ${entryId}`,
          code: 'ENTRY_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    if (!entry.enrichment) {
      return c.json(
        {
          entryId,
          status: 'not_enriched' as const,
          enrichment: null,
        },
        200,
      );
    }

    return c.json(
      {
        entryId,
        status: 'enriched' as const,
        enrichment: {
          claims: entry.enrichment.claims.map((cl) => ({ ...cl })),
          enrichedAt: entry.enrichment.enrichedAt.toISOString(),
          searchQueries: [...entry.enrichment.searchQueries],
          sourceUrls: [...entry.enrichment.sourceUrls],
        },
      },
      200,
    );
  });

  return routes;
}
