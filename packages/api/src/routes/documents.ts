import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRouter, type AppEnv } from '../types.js';
import {
  ErrorResponseSchema,
  DocumentGenerateResponseSchema,
  DocumentMetaResponseSchema,
} from '../schemas/responses.js';

const DomainSchemaIdParamSchema = z.object({
  domainSchemaId: z.string().min(1),
});

const generateDocumentRoute = createRoute({
  method: 'post',
  path: '/{domainSchemaId}/documents/generate',
  tags: ['Documents'],
  summary: 'Generate a knowledge document',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Document generated',
      content: {
        'application/json': {
          schema: DocumentGenerateResponseSchema,
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

const getLatestDocumentRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/documents/latest',
  tags: ['Documents'],
  summary: 'Get latest document as markdown',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Document markdown content',
      content: {
        'text/markdown': {
          schema: z.string(),
        },
      },
    },
    404: {
      description: 'Document not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getLatestDocumentMetaRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/documents/latest/meta',
  tags: ['Documents'],
  summary: 'Get latest document metadata',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Document metadata',
      content: {
        'application/json': {
          schema: DocumentMetaResponseSchema,
        },
      },
    },
    404: {
      description: 'Document not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getChapterRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/documents/latest/{filename}',
  tags: ['Documents'],
  summary: 'Get a specific chapter as markdown',
  request: {
    params: z.object({
      domainSchemaId: z.string().min(1),
      filename: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Chapter markdown content',
      content: {
        'text/markdown': {
          schema: z.string(),
        },
      },
    },
    404: {
      description: 'Document or chapter not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createDocumentRoutes(): OpenAPIHono<AppEnv> {
  const docs = createRouter();

  docs.openapi(generateDocumentRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { documentGenerator, schemaRepository } = c.get('tenantRepos');

    const domainSchema = await schemaRepository.getDomainSchema(domainSchemaId);
    if (!domainSchema) {
      return c.json(
        {
          error: `Domain schema not found: ${domainSchemaId}`,
          code: 'SCHEMA_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    const result = await documentGenerator.generate({ domainSchemaId });

    return c.json(
      {
        status: 'completed' as const,
        meta: {
          ...result.meta,
          sourceEntryIds: [...result.meta.sourceEntryIds],
        },
        chapters: result.chapters.map((ch) => ({
          filename: ch.filename,
          title: ch.title,
          entryCount: ch.entryCount,
          gapCount: ch.gapCount,
        })),
      },
      200,
    );
  });

  docs.openapi(getLatestDocumentRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { documentGenerator } = c.get('tenantRepos');

    const result = await documentGenerator.getLatest(domainSchemaId);
    if (!result) {
      return c.json(
        {
          error: `No generated document found for domain: ${domainSchemaId}`,
          code: 'DOCUMENT_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    c.header('Content-Type', 'text/markdown; charset=utf-8');
    return c.body(result.indexContent);
  });

  docs.openapi(getLatestDocumentMetaRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { documentGenerator } = c.get('tenantRepos');

    const result = await documentGenerator.getLatest(domainSchemaId);
    if (!result) {
      return c.json(
        {
          error: `No generated document found for domain: ${domainSchemaId}`,
          code: 'DOCUMENT_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    return c.json(
      {
        ...result.meta,
        sourceEntryIds: [...result.meta.sourceEntryIds],
      },
      200,
    );
  });

  docs.openapi(getChapterRoute, async (c) => {
    const { domainSchemaId, filename } = c.req.valid('param');
    const { documentGenerator } = c.get('tenantRepos');

    const result = await documentGenerator.getLatest(domainSchemaId);
    if (!result) {
      return c.json(
        {
          error: `No generated document found for domain: ${domainSchemaId}`,
          code: 'DOCUMENT_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    const chapter = result.chapters.find((ch) => ch.filename === filename);
    if (!chapter) {
      return c.json(
        {
          error: `Chapter not found: ${filename}`,
          code: 'CHAPTER_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    c.header('Content-Type', 'text/markdown; charset=utf-8');
    return c.body(chapter.content);
  });

  return docs;
}
