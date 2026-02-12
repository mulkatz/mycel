import { Hono } from 'hono';
import type { DocumentGenerator } from '@mycel/core/src/services/document-generator/types.js';
import type { SchemaRepository } from '@mycel/core/src/repositories/schema.repository.js';
import type { AppEnv } from '../types.js';

export interface DocumentRouteDeps {
  readonly documentGenerator: DocumentGenerator;
  readonly schemaRepository: SchemaRepository;
}

export function createDocumentRoutes(deps: DocumentRouteDeps): Hono<AppEnv> {
  const docs = new Hono<AppEnv>();

  docs.post('/:domainSchemaId/documents/generate', async (c) => {
    const { domainSchemaId } = c.req.param();

    const domainSchema =
      (await deps.schemaRepository.getDomainSchemaByName(domainSchemaId)) ??
      (await deps.schemaRepository.getDomainSchema(domainSchemaId));
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

    const result = await deps.documentGenerator.generate({ domainSchemaId });

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

    const result = await deps.documentGenerator.getLatest(domainSchemaId);
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

    const result = await deps.documentGenerator.getLatest(domainSchemaId);
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

    const result = await deps.documentGenerator.getLatest(domainSchemaId);
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
