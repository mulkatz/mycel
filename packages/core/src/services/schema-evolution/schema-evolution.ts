import type { EvolutionProposal, FieldStats } from '@mycel/shared/src/types/evolution.types.js';
import { SchemaGenerationError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import type {
  SchemaEvolutionDeps,
  SchemaEvolutionService,
  EvolutionReviewParams,
  EvolutionReviewResult,
} from './types.js';
import { generateProposals } from './evolution-proposer.js';
import { applyProposal } from './evolution-applier.js';
import type { FirestoreBase } from '../../infrastructure/firestore-types.js';

const log = createChildLogger('schema-evolution');

const AUTO_APPLY_CONFIDENCE_THRESHOLD = 0.7;

export interface SchemaEvolutionConfig {
  readonly firestoreBase?: FirestoreBase;
}

export function createSchemaEvolutionService(
  deps: SchemaEvolutionDeps,
  config?: SchemaEvolutionConfig,
): SchemaEvolutionService {
  const {
    knowledgeRepository,
    schemaRepository,
    proposalRepository,
    fieldStatsRepository,
    llmClient,
  } = deps;

  return {
    async analyze(domainSchemaId: string): Promise<readonly EvolutionProposal[]> {
      log.info({ domainSchemaId }, 'Starting schema evolution analysis');

      const schema = await schemaRepository.getDomainSchemaByName(domainSchemaId);
      if (!schema) {
        throw new SchemaGenerationError(`Domain schema not found: ${domainSchemaId}`);
      }

      if (schema.behavior.schemaEvolution === 'fixed') {
        log.info({ domainSchemaId }, 'Schema evolution disabled (fixed mode)');
        return [];
      }

      const uncategorized = await knowledgeRepository.getUncategorizedByDomain(domainSchemaId);

      log.info(
        { domainSchemaId, uncategorizedCount: uncategorized.length },
        'Fetched uncategorized entries',
      );

      const proposals = await generateProposals(
        domainSchemaId,
        uncategorized,
        schema.config,
        proposalRepository,
        fieldStatsRepository,
        llmClient,
      );

      // Auto-apply in 'auto' mode
      if (schema.behavior.schemaEvolution === 'auto') {
        for (const proposal of proposals) {
          const shouldAutoApply = canAutoApply(proposal);
          if (shouldAutoApply) {
            try {
              const currentSchema = await schemaRepository.getDomainSchemaByName(domainSchemaId);
              if (currentSchema) {
                await applyProposal(proposal, currentSchema, {
                  schemaRepository,
                  knowledgeRepository,
                  proposalRepository,
                  firestoreBase: config?.firestoreBase,
                }, true);

                log.info(
                  { proposalId: proposal.id, type: proposal.type },
                  'Auto-applied evolution proposal',
                );
              }
            } catch (error) {
              log.warn(
                {
                  proposalId: proposal.id,
                  error: error instanceof Error ? error.message : String(error),
                },
                'Failed to auto-apply proposal',
              );
            }
          }
        }
      }

      return proposals;
    },

    async reviewProposal(
      proposalId: string,
      review: EvolutionReviewParams,
    ): Promise<EvolutionReviewResult> {
      log.info({ proposalId, decision: review.decision }, 'Reviewing evolution proposal');

      const proposal = await proposalRepository.getById(proposalId);
      if (!proposal) {
        throw new SchemaGenerationError(`Evolution proposal not found: ${proposalId}`);
      }

      if (proposal.status !== 'pending') {
        throw new SchemaGenerationError(
          `Proposal ${proposalId} has already been reviewed (status: ${proposal.status})`,
        );
      }

      if (review.decision === 'reject') {
        await proposalRepository.update(proposalId, { status: 'rejected' });
        return { proposalId, status: 'rejected' };
      }

      const schema = await schemaRepository.getDomainSchemaByName(proposal.domainSchemaId);
      if (!schema) {
        throw new SchemaGenerationError(
          `Domain schema not found: ${proposal.domainSchemaId}`,
        );
      }

      const domainSchemaId = await applyProposal(proposal, schema, {
        schemaRepository,
        knowledgeRepository,
        proposalRepository,
        firestoreBase: config?.firestoreBase,
      }, false);

      return {
        proposalId,
        status: 'approved',
        domainSchemaId,
      };
    },

    async getProposals(domainSchemaId: string): Promise<readonly EvolutionProposal[]> {
      return proposalRepository.getByDomain(domainSchemaId);
    },

    async getFieldStats(domainSchemaId: string): Promise<readonly FieldStats[]> {
      return fieldStatsRepository.getByDomain(domainSchemaId);
    },
  };
}

function canAutoApply(proposal: EvolutionProposal): boolean {
  switch (proposal.type) {
    case 'new_category':
      return proposal.confidence >= AUTO_APPLY_CONFIDENCE_THRESHOLD;
    case 'new_field':
      return proposal.newField?.fieldType === 'optional';
    case 'change_priority':
      return true;
    default:
      return false;
  }
}
