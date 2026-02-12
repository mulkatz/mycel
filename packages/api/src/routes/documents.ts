import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export function createDocumentRoutes(): Hono<AppEnv> {
  const docs = new Hono<AppEnv>();

  docs.post('/:domainSchemaId/documents/generate', async (c) => {
    const { domainSchemaId } = c.req.param();
    const { documentGenerator, schemaRepository } = c.get('tenantRepos');

    const domainSchema =
      (await schemaRepository.getDomainSchemaByName(domainSchemaId)) ??
      (await schemaRepository.getDomainSchema(domainSchemaId));
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

    return c.json({
      status: 'completed',
      meta: result.meta,
      chapters: result.chapters.map((ch) => ({
        filename: ch.filename,
        title: ch.title,
        entryCount: ch.entryCount,
        gapCount: ch.gapCount,
      })),
    });
  });

  docs.get('/:domainSchemaId/documents/latest', async (c) => {
    const { domainSchemaId } = c.req.param();
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

  docs.get('/:domainSchemaId/documents/latest/meta', async (c) => {
    const { domainSchemaId } = c.req.param();
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

    return c.json(result.meta);
  });

  docs.get('/:domainSchemaId/documents/latest/:filename', async (c) => {
    const { domainSchemaId, filename } = c.req.param();
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
