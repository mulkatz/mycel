import type { Firestore } from '@google-cloud/firestore';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js';
import type { SchemaRepository } from '../repositories/schema.repository.js';
import type { FieldStatsRepository } from '../repositories/field-stats.repository.js';
import type { EvolutionProposalRepository } from '../repositories/evolution-proposal.repository.js';
import type { SchemaProposalRepository } from '../repositories/schema-proposal.repository.js';
import type { DocumentGenerator } from '../services/document-generator/types.js';
import type { SchemaEvolutionService } from '../services/schema-evolution/types.js';
import type { SchemaGenerator } from '../services/schema-generator/types.js';
import type { EnrichmentOrchestrator } from '../services/enrichment/types.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { TextLlmClient } from '../llm/text-llm-client.js';
import type { EmbeddingClient } from '../embedding/embedding-client.js';
import type { WebSearchClient } from '../services/web-search/types.js';
import type { SearchCacheRepository } from '../repositories/search-cache.repository.js';
import { createFirestoreSessionRepository } from './firestore-session.repository.js';
import { createFirestoreKnowledgeRepository } from './firestore-knowledge.repository.js';
import { createFirestoreSchemaRepository } from './firestore-schema.repository.js';
import { createFirestoreSchemaProposalRepository } from './firestore-schema-proposal.repository.js';
import { createFirestoreEvolutionProposalRepository } from './firestore-evolution-proposal.repository.js';
import { createFirestoreFieldStatsRepository } from './firestore-field-stats.repository.js';
import { createDocumentGenerator } from '../services/document-generator/document-generator.js';
import { createSchemaEvolutionService } from '../services/schema-evolution/schema-evolution.js';
import { createSchemaGenerator } from '../services/schema-generator/schema-generator.js';
import { createEnrichmentOrchestrator } from '../services/enrichment/enrichment-orchestrator.js';

export interface TenantRepositories {
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly fieldStatsRepository: FieldStatsRepository;
  readonly evolutionProposalRepository: EvolutionProposalRepository;
  readonly schemaProposalRepository: SchemaProposalRepository;
  readonly documentGenerator: DocumentGenerator;
  readonly schemaEvolutionService: SchemaEvolutionService;
  readonly schemaGenerator: SchemaGenerator;
  readonly enrichmentOrchestrator: EnrichmentOrchestrator;
}

export interface SharedDeps {
  readonly llmClient: LlmClient;
  readonly textLlmClient: TextLlmClient;
  readonly embeddingClient?: EmbeddingClient;
  readonly webSearchClient: WebSearchClient;
  readonly searchCacheRepository: SearchCacheRepository;
}

export function createTenantRepositories(
  db: Firestore,
  tenantId: string,
  shared: SharedDeps,
): TenantRepositories {
  const tenantBase = db.collection('tenants').doc(tenantId);

  const sessionRepository = createFirestoreSessionRepository(tenantBase);
  const knowledgeRepository = createFirestoreKnowledgeRepository(tenantBase);
  const schemaRepository = createFirestoreSchemaRepository(tenantBase);
  const fieldStatsRepository = createFirestoreFieldStatsRepository(tenantBase);
  const evolutionProposalRepository = createFirestoreEvolutionProposalRepository(tenantBase);
  const schemaProposalRepository = createFirestoreSchemaProposalRepository(tenantBase);

  const documentGenerator = createDocumentGenerator({
    knowledgeRepository,
    schemaRepository,
    textLlmClient: shared.textLlmClient,
    firestoreBase: tenantBase,
  });

  const schemaEvolutionService = createSchemaEvolutionService(
    {
      knowledgeRepository,
      schemaRepository,
      proposalRepository: evolutionProposalRepository,
      fieldStatsRepository,
      llmClient: shared.llmClient,
    },
    { firestoreBase: tenantBase },
  );

  const schemaGenerator = createSchemaGenerator({
    llmClient: shared.llmClient,
    webSearchClient: shared.webSearchClient,
    proposalRepository: schemaProposalRepository,
    schemaRepository,
  });

  const enrichmentOrchestrator = createEnrichmentOrchestrator(
    {
      llmClient: shared.llmClient,
      webSearchClient: shared.webSearchClient,
      knowledgeRepository,
      searchCacheRepository: shared.searchCacheRepository,
    },
    {
      maxSearchesPerTurn: 3,
      domainSchemaId: '',
      webSearchMode: 'enrichment',
      validationMode: 'flag_conflicts',
    },
  );

  return {
    sessionRepository,
    knowledgeRepository,
    schemaRepository,
    fieldStatsRepository,
    evolutionProposalRepository,
    schemaProposalRepository,
    documentGenerator,
    schemaEvolutionService,
    schemaGenerator,
    enrichmentOrchestrator,
  };
}
