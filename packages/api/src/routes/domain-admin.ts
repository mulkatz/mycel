import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRouter, type AppEnv } from '../types.js';
import { ListDomainsQuerySchema, ListEntriesQuerySchema } from '../schemas/requests.js';
import {
  DomainDetailResponseSchema,
  DomainListResponseSchema,
  EntryDetailResponseSchema,
  EntryListResponseSchema,
  ErrorResponseSchema,
} from '../schemas/responses.js';

const DomainSchemaIdParamSchema = z.object({
  domainSchemaId: z.string().min(1),
});

const EntryIdParamSchema = z.object({
  domainSchemaId: z.string().min(1),
  entryId: z.string().min(1),
});

const listDomainsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Domains'],
  summary: 'List all domain schemas',
  request: {
    query: ListDomainsQuerySchema,
  },
  responses: {
    200: {
      description: 'List of domain schemas',
      content: {
        'application/json': {
          schema: DomainListResponseSchema,
        },
      },
    },
  },
});

const getDomainRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}',
  tags: ['Domains'],
  summary: 'Get domain schema details',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Domain schema details',
      content: {
        'application/json': {
          schema: DomainDetailResponseSchema,
        },
      },
    },
    404: {
      description: 'Domain schema not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const listEntriesRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/entries',
  tags: ['Entries'],
  summary: 'List knowledge entries for a domain',
  request: {
    params: DomainSchemaIdParamSchema,
    query: ListEntriesQuerySchema,
  },
  responses: {
    200: {
      description: 'List of knowledge entries',
      content: {
        'application/json': {
          schema: EntryListResponseSchema,
        },
      },
    },
    404: {
      description: 'Domain schema not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getEntryRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/entries/{entryId}',
  tags: ['Entries'],
  summary: 'Get knowledge entry details',
  request: {
    params: EntryIdParamSchema,
  },
  responses: {
    200: {
      description: 'Knowledge entry details',
      content: {
        'application/json': {
          schema: EntryDetailResponseSchema,
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

export function createDomainAdminRoutes(): OpenAPIHono<AppEnv> {
  const routes = createRouter();

  routes.openapi(listDomainsRoute, async (c) => {
    const query = c.req.valid('query');
    const { schemaRepository } = c.get('tenantRepos');

    const filter = query.active !== undefined ? { isActive: query.active } : undefined;
    const domains = await schemaRepository.listDomainSchemas(filter);

    return c.json(
      {
        domains: domains.map((d) => ({
          domainSchemaId: d.id,
          name: d.name,
          version: d.version,
          isActive: d.isActive,
          origin: d.origin,
          categoryCount: d.config.categories.length,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        })),
      },
      200,
    );
  });

  routes.openapi(getDomainRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { schemaRepository } = c.get('tenantRepos');

    const domain = await schemaRepository.getDomainSchema(domainSchemaId);
    if (!domain) {
      return c.json(
        {
          error: `Domain schema not found: ${domainSchemaId}`,
          code: 'DOMAIN_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    return c.json(
      {
        domainSchemaId: domain.id,
        name: domain.name,
        version: domain.version,
        isActive: domain.isActive,
        origin: domain.origin,
        generatedFrom: domain.generatedFrom,
        config: domain.config as unknown as Record<string, unknown>,
        behavior: domain.behavior as unknown as Record<string, unknown>,
        createdAt: domain.createdAt.toISOString(),
        updatedAt: domain.updatedAt.toISOString(),
      },
      200,
    );
  });

  routes.openapi(listEntriesRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { category, limit, offset } = c.req.valid('query');
    const { schemaRepository, knowledgeRepository } = c.get('tenantRepos');

    const domain = await schemaRepository.getDomainSchema(domainSchemaId);
    if (!domain) {
      return c.json(
        {
          error: `Domain schema not found: ${domainSchemaId}`,
          code: 'DOMAIN_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    let entries = await knowledgeRepository.getByDomain(domainSchemaId);

    if (category) {
      entries = entries.filter((e) => e.categoryId === category);
    }

    // Sort by createdAt descending (most recent first)
    const sorted = [...entries].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const total = sorted.length;
    const paged = sorted.slice(offset, offset + limit);

    return c.json(
      {
        entries: paged.map((e) => ({
          entryId: e.id,
          sessionId: e.sessionId,
          category: e.categoryId,
          title: e.title,
          confidence: e.confidence,
          hasEnrichment: e.enrichment !== undefined,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
      },
      200,
    );
  });

  routes.openapi(getEntryRoute, async (c) => {
    const { domainSchemaId, entryId } = c.req.valid('param');
    const { knowledgeRepository } = c.get('tenantRepos');

    const entry = await knowledgeRepository.getById(entryId);
    if (!entry || entry.domainSchemaId !== domainSchemaId) {
      return c.json(
        {
          error: `Entry not found: ${entryId}`,
          code: 'ENTRY_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    return c.json(
      {
        entryId: entry.id,
        sessionId: entry.sessionId,
        domainSchemaId: entry.domainSchemaId,
        category: entry.categoryId,
        title: entry.title,
        content: entry.content,
        confidence: entry.confidence,
        structuredData: entry.structuredData,
        tags: [...entry.tags],
        enrichment: entry.enrichment
          ? (entry.enrichment as unknown as Record<string, unknown>)
          : null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
      200,
    );
  });

  return routes;
}
