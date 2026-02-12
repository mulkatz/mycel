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
import { createWebSearchClient } from '@mycel/core/src/services/web-search/web-search-client.js';
import { createMockWebSearchClient } from '@mycel/core/src/services/web-search/mock-web-search-client.js';
import { createFirestoreSchemaProposalRepository } from '@mycel/core/src/infrastructure/firestore-schema-proposal.repository.js';
import { createFirestoreEvolutionProposalRepository } from '@mycel/core/src/infrastructure/firestore-evolution-proposal.repository.js';
import { createFirestoreFieldStatsRepository } from '@mycel/core/src/infrastructure/firestore-field-stats.repository.js';
import { createSchemaGenerator } from '@mycel/core/src/services/schema-generator/schema-generator.js';
import { createSchemaEvolutionService } from '@mycel/core/src/services/schema-evolution/schema-evolution.js';
import { createFirestoreSearchCacheRepository } from '@mycel/core/src/infrastructure/firestore-search-cache.repository.js';
import { createEnrichmentOrchestrator } from '@mycel/core/src/services/enrichment/enrichment-orchestrator.js';
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

  const projectId = process.env['MYCEL_GCP_PROJECT_ID'] ?? process.env['GCP_PROJECT_ID'] ?? '';
  const aiLocation = process.env['VERTEX_AI_LOCATION'] ?? 'europe-west1';

  const webSearchClient =
    process.env['MYCEL_MOCK_LLM'] === 'true'
      ? createMockWebSearchClient()
      : createWebSearchClient({ projectId, location: aiLocation });

  const proposalRepository = createFirestoreSchemaProposalRepository(db);
  const evolutionProposalRepository = createFirestoreEvolutionProposalRepository(db);
  const fieldStatsRepository = createFirestoreFieldStatsRepository(db);

  const schemaGenerator = createSchemaGenerator({
    llmClient,
    webSearchClient,
    proposalRepository,
    schemaRepository,
  });

  const schemaEvolutionService = createSchemaEvolutionService(
    {
      knowledgeRepository,
      schemaRepository,
      proposalRepository: evolutionProposalRepository,
      fieldStatsRepository,
      llmClient,
    },
    { firestoreClient: db },
  );

  const searchCacheRepository = createFirestoreSearchCacheRepository(db);

  const enrichmentOrchestrator = createEnrichmentOrchestrator(
    {
      llmClient,
      webSearchClient,
      knowledgeRepository,
      searchCacheRepository,
    },
    {
      maxSearchesPerTurn: 3,
      domainSchemaId: '',
      webSearchMode: 'enrichment',
      validationMode: 'flag_conflicts',
    },
  );

  const app = createApp({
    sessionRepository: createFirestoreSessionRepository(db),
    knowledgeRepository,
    schemaRepository,
    llmClient,
    embeddingClient,
    documentGenerator,
    schemaGenerator,
    schemaEvolutionService,
    fieldStatsRepository,
    enrichmentOrchestrator,
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
