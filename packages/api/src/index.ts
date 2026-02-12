import { serve } from '@hono/node-server';
import { createFirestoreClient } from '@mycel/core/src/infrastructure/firestore-client.js';
import { createLlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createTextLlmClient } from '@mycel/core/src/llm/text-llm-client.js';
import { createVertexEmbeddingClient } from '@mycel/core/src/embedding/vertex-embedding-client.js';
import { createMockEmbeddingClient } from '@mycel/core/src/embedding/mock-embedding-client.js';
import { createWebSearchClient } from '@mycel/core/src/services/web-search/web-search-client.js';
import { createMockWebSearchClient } from '@mycel/core/src/services/web-search/mock-web-search-client.js';
import { createFirestoreSearchCacheRepository } from '@mycel/core/src/infrastructure/firestore-search-cache.repository.js';
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

  const projectId = process.env['MYCEL_GCP_PROJECT_ID'] ?? process.env['GCP_PROJECT_ID'] ?? '';
  const aiLocation = process.env['VERTEX_AI_LOCATION'] ?? 'europe-west1';

  const webSearchClient =
    process.env['MYCEL_MOCK_LLM'] === 'true'
      ? createMockWebSearchClient()
      : createWebSearchClient({ projectId, location: aiLocation });

  const searchCacheRepository = createFirestoreSearchCacheRepository(db);

  const app = createApp({
    db,
    projectId,
    sharedDeps: {
      llmClient,
      textLlmClient,
      embeddingClient,
      webSearchClient,
      searchCacheRepository,
    },
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
