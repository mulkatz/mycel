import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export function createEntryRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/:entryId/enrichment', async (c) => {
    const { entryId } = c.req.param();
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
      return c.json({
        entryId,
        status: 'not_enriched',
        enrichment: null,
      });
    }

    return c.json({
      entryId,
      status: 'enriched',
      enrichment: {
        claims: entry.enrichment.claims,
        enrichedAt: entry.enrichment.enrichedAt.toISOString(),
        searchQueries: entry.enrichment.searchQueries,
        sourceUrls: entry.enrichment.sourceUrls,
      },
    });
  });

  return routes;
}
