import { serve } from '@hono/node-server';
import { createFirestoreClient } from '@mycel/core/src/infrastructure/firestore-client.js';
import { createFirestoreSessionRepository } from '@mycel/core/src/infrastructure/firestore-session.repository.js';
import { createFirestoreKnowledgeRepository } from '@mycel/core/src/infrastructure/firestore-knowledge.repository.js';
import { createFirestoreSchemaRepository } from '@mycel/core/src/infrastructure/firestore-schema.repository.js';
import { createLlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createTextLlmClient } from '@mycel/core/src/llm/text-llm-client.js';
import { createVertexEmbeddingClient } from '@mycel/core/src/embedding/vertex-embedding-client.js';
import { createMockEmbeddingClient } from '@mycel/core/src/embedding/mock-embedding-client.js';
import { createDocumentGenerator } from '@mycel/core/src/services/document-generator/document-generator.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { createApp } from './app.js';

const log = createChildLogger('api:main');

async function main(): Promise<void> {
  const port = parseInt(process.env['PORT'] ?? '3000', 10);

  const db = createFirestoreClient();
  const llmClient = await createLlmClient();
  const textLlmClient = await createTextLlmClient();
  const embeddingClient =
    process.env['MYCEL_MOCK_LLM'] === 'true'
      ? createMockEmbeddingClient()
      : createVertexEmbeddingClient();

  const knowledgeRepository = createFirestoreKnowledgeRepository(db);
  const schemaRepository = createFirestoreSchemaRepository(db);

  const documentGenerator = createDocumentGenerator({
    knowledgeRepository,
    schemaRepository,
    textLlmClient,
    firestoreClient: db,
  });

  const app = createApp({
    sessionRepository: createFirestoreSessionRepository(db),
    knowledgeRepository,
    schemaRepository,
    llmClient,
    embeddingClient,
    documentGenerator,
  });

  log.info({ port }, 'Starting Mycel API server');

  serve({ fetch: app.fetch, port }, (info) => {
    log.info({ port: info.port }, 'Mycel API server running');
  });
}

main().catch((error: unknown) => {
  log.error(
    { error: error instanceof Error ? error.message : String(error) },
    'Failed to start API server',
  );
  process.exit(1);
});
