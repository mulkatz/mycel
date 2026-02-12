import { createChildLogger } from '@mycel/shared/src/logger.js';
import type { EnrichmentDeps, EnrichmentConfig, EnrichmentOrchestrator } from './types.js';
import { extractClaims } from './claim-extractor.js';
import { validateClaims } from './claim-validator.js';

const log = createChildLogger('enrichment:orchestrator');

const DEFAULT_MAX_SEARCHES = 3;

export function createEnrichmentOrchestrator(
  deps: EnrichmentDeps,
  config: EnrichmentConfig,
): EnrichmentOrchestrator {
  const maxSearches = config.maxSearchesPerTurn !== undefined ? config.maxSearchesPerTurn : DEFAULT_MAX_SEARCHES;

  return {
    async enrichAsync(params: {
      userInput: string;
      entryId: string;
      categoryId: string;
      domainSchemaId: string;
    }): Promise<void> {
      const { userInput, entryId } = params;

      log.info({ entryId, domainSchemaId: params.domainSchemaId }, 'Starting enrichment');

      // 1. Guard: only run for enrichment/full modes
      if (config.webSearchMode !== 'enrichment' && config.webSearchMode !== 'full') {
        log.debug({ entryId }, 'Enrichment skipped (mode not enrichment/full)');
        return;
      }

      // 2. Extract claims
      const claims = await extractClaims(userInput, deps.llmClient);

      if (claims.length === 0) {
        log.info({ entryId }, 'No verifiable claims found, skipping enrichment');
        return;
      }

      // 3. Validate claims
      const { verified, searchQueries, sourceUrls } = await validateClaims(
        claims,
        deps.llmClient,
        deps.webSearchClient,
        deps.searchCacheRepository,
        maxSearches,
      );

      // 4. Update entry with enrichment metadata
      await deps.knowledgeRepository.update(entryId, {
        enrichment: {
          claims: verified,
          enrichedAt: new Date(),
          searchQueries,
          sourceUrls,
        },
      });

      const contradicted = verified.filter((c) => c.status === 'contradicted');
      const verifiedCount = verified.filter((c) => c.status === 'verified');

      log.info(
        {
          entryId,
          totalClaims: verified.length,
          verified: verifiedCount.length,
          contradicted: contradicted.length,
          searchesPerformed: searchQueries.length,
        },
        'Enrichment complete',
      );
    },
  };
}
