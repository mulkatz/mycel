import { createChildLogger } from '@mycel/shared/src/logger.js';
import { SchemaGenerationError } from '@mycel/shared/src/utils/errors.js';
import { DomainSchema } from '@mycel/schemas/src/domain.schema.js';
import type { DomainBehaviorConfig, BehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import { resolveBehaviorPreset, BehaviorPresetSchema } from '@mycel/schemas/src/domain-behavior.schema.js';
import type {
  SchemaGeneratorDeps,
  GenerateSchemaParams,
  SchemaGenerationResult,
  ReviewParams,
  ReviewResult,
  SchemaGenerator,
} from './types.js';
import type { SchemaProposal } from '../../repositories/schema-proposal.repository.js';
import { analyzeDomain } from './domain-analyzer.js';
import { synthesizeSchema } from './schema-synthesizer.js';
import type { WebSearchResult } from '../web-search/types.js';

const log = createChildLogger('schema-generator');

function resolveBehavior(config?: BehaviorPreset | DomainBehaviorConfig): DomainBehaviorConfig {
  if (!config) {
    return resolveBehaviorPreset('balanced');
  }

  if (typeof config === 'string') {
    const parsed = BehaviorPresetSchema.safeParse(config);
    if (parsed.success) {
      return resolveBehaviorPreset(parsed.data);
    }
    return resolveBehaviorPreset('balanced');
  }

  return config;
}

// Schema evolution is implemented in services/schema-evolution/

export function createSchemaGenerator(deps: SchemaGeneratorDeps): SchemaGenerator {
  const { llmClient, webSearchClient, proposalRepository, schemaRepository } = deps;

  return {
    async generate(params: GenerateSchemaParams): Promise<SchemaGenerationResult> {
      log.info({ descriptionLength: params.description.length }, 'Starting schema generation');

      // 1. Analyze domain description
      const analysis = await analyzeDomain(params.description, llmClient, params.language);

      // 2. Execute web searches sequentially (tolerant of individual failures)
      const searchResults: WebSearchResult[] = [];
      const systemContext = `You are researching the topic "${analysis.subject}" (${analysis.domainType}) to help create a knowledge management schema.`;

      for (const query of analysis.searchQueries) {
        try {
          const result = await webSearchClient.search(query, systemContext);
          searchResults.push(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.warn({ query, error: message }, 'Web search failed for query, continuing');
        }
      }

      if (searchResults.length === 0) {
        throw new SchemaGenerationError(
          'All web searches failed. Cannot generate schema without research data.',
        );
      }

      log.info(
        { successfulSearches: searchResults.length, totalQueries: analysis.searchQueries.length },
        'Web searches completed',
      );

      // 3. Synthesize schema
      const proposedSchema = await synthesizeSchema(
        analysis,
        searchResults,
        llmClient,
        params.partialSchema,
      );

      // 4. Resolve behavior config
      const behavior = resolveBehavior(params.config);

      // 5. Collect all source URLs
      const allSources = [...new Set(searchResults.flatMap((r) => [...r.sourceUrls]))];

      // 6. Build reasoning summary
      const reasoning = `Analyzed domain "${analysis.subject}" (${analysis.domainType})${analysis.location ? ` in ${analysis.location}` : ''}. ` +
        `Executed ${String(searchResults.length)}/${String(analysis.searchQueries.length)} web searches successfully. ` +
        `Generated ${String(proposedSchema.categories.length)} categories covering the domain.`;

      // 7. Store as proposal
      const proposal = await proposalRepository.saveProposal({
        description: params.description,
        language: analysis.language,
        proposedSchema,
        behavior,
        reasoning,
        sources: allSources,
      });

      log.info(
        { proposalId: proposal.id, categoryCount: proposedSchema.categories.length },
        'Schema proposal created',
      );

      return {
        proposalId: proposal.id,
        status: 'pending',
        domain: proposedSchema,
        behavior,
        reasoning,
        sources: allSources,
      };
    },

    async reviewProposal(proposalId: string, review: ReviewParams): Promise<ReviewResult> {
      log.info({ proposalId, decision: review.decision }, 'Reviewing schema proposal');

      const proposal = await proposalRepository.getProposal(proposalId);
      if (!proposal) {
        throw new SchemaGenerationError(`Proposal not found: ${proposalId}`);
      }

      if (proposal.status !== 'pending') {
        throw new SchemaGenerationError(
          `Proposal ${proposalId} has already been reviewed (status: ${proposal.status})`,
        );
      }

      if (review.decision === 'reject') {
        await proposalRepository.updateProposal(proposalId, {
          status: 'rejected',
          feedback: review.feedback,
        });

        return { proposalId, status: 'rejected' };
      }

      // approve or approve_with_changes
      let finalSchema = proposal.proposedSchema;

      if (review.decision === 'approve_with_changes' && review.modifications) {
        finalSchema = {
          ...finalSchema,
          ...review.modifications,
          categories: review.modifications.categories ?? finalSchema.categories,
        };

        const validation = DomainSchema.safeParse(finalSchema);
        if (!validation.success) {
          const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
          throw new SchemaGenerationError(
            `Modified schema is invalid: ${errors.join(', ')}`,
          );
        }
      }

      // Save as active domain schema
      const savedSchema = await schemaRepository.saveDomainSchema({
        name: finalSchema.name,
        version: 1,
        config: finalSchema,
        behavior: proposal.behavior,
        origin: 'web_research',
        generatedFrom: proposalId,
        isActive: true,
      });

      // Update proposal
      await proposalRepository.updateProposal(proposalId, {
        status: 'approved',
        resultingDomainSchemaId: savedSchema.id,
        proposedSchema: finalSchema,
        feedback: review.feedback,
      });

      log.info(
        { proposalId, domainSchemaId: savedSchema.id },
        'Schema proposal approved and domain schema created',
      );

      return {
        proposalId,
        status: 'approved',
        domainSchemaId: savedSchema.id,
      };
    },

    async getProposal(proposalId: string): Promise<SchemaProposal | null> {
      return proposalRepository.getProposal(proposalId);
    },
  };
}
