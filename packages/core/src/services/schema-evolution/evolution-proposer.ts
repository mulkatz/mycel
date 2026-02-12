import type { EvolutionProposal } from '@mycel/shared/src/types/evolution.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { EvolutionProposalRepository } from '../../repositories/evolution-proposal.repository.js';
import type { FieldStatsRepository } from '../../repositories/field-stats.repository.js';
import type { LlmClient } from '../../llm/llm-client.js';
import { detectPatterns } from './pattern-detector.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('schema-evolution:proposer');

const LOW_ANSWER_RATE_THRESHOLD = 0.1;
const MIN_ASKED_FOR_PRIORITY_CHANGE = 10;

export async function generateProposals(
  domainSchemaId: string,
  uncategorizedEntries: readonly KnowledgeEntry[],
  domainConfig: DomainConfig,
  proposalRepository: EvolutionProposalRepository,
  fieldStatsRepository: FieldStatsRepository,
  llmClient: LlmClient,
): Promise<readonly EvolutionProposal[]> {
  const proposals: EvolutionProposal[] = [];

  // 1. Detect patterns in uncategorized entries
  const patterns = await detectPatterns(uncategorizedEntries, domainConfig, llmClient);

  for (const { cluster, label } of patterns) {
    const proposal = await proposalRepository.create({
      domainSchemaId,
      type: 'new_category',
      description: `New category "${label.label}" discovered from ${String(cluster.entries.length)} uncategorized entries`,
      evidence: cluster.entries.map((e) => e.id),
      confidence: Math.min(cluster.averageSimilarity, 0.95),
      newCategory: {
        id: label.categoryId,
        label: label.label,
        description: label.description,
        suggestedFields: label.suggestedFields,
      },
      clusterMetadata: {
        centroidEntryId: cluster.centroidEntryId,
        clusterSize: cluster.entries.length,
        averageSimilarity: cluster.averageSimilarity,
        topKeywords: cluster.topKeywords,
      },
    });

    proposals.push(proposal);
    log.info(
      { proposalId: proposal.id, categoryId: label.categoryId, clusterSize: cluster.entries.length },
      'Created new_category proposal',
    );
  }

  // 2. Check field stats for low answer rates
  const stats = await fieldStatsRepository.getByDomain(domainSchemaId);

  for (const stat of stats) {
    if (
      stat.timesAsked >= MIN_ASKED_FOR_PRIORITY_CHANGE &&
      stat.answerRate < LOW_ANSWER_RATE_THRESHOLD
    ) {
      // Check if the field is currently required
      const category = domainConfig.categories.find((c) => c.id === stat.categoryId);
      if (!category) continue;

      const isRequired = category.requiredFields?.includes(stat.fieldName) ?? false;
      if (!isRequired) continue;

      const proposal = await proposalRepository.create({
        domainSchemaId,
        type: 'change_priority',
        description: `Field "${stat.fieldName}" in "${stat.categoryId}" has a ${String(Math.round(stat.answerRate * 100))}% answer rate (${String(stat.timesAnswered)}/${String(stat.timesAsked)}). Consider making it optional.`,
        evidence: [],
        confidence: 1.0 - stat.answerRate,
        changePriority: {
          targetCategoryId: stat.categoryId,
          fieldName: stat.fieldName,
          answerRate: stat.answerRate,
          reasoning: `Only ${String(Math.round(stat.answerRate * 100))}% of users could answer this question after ${String(stat.timesAsked)} asks.`,
        },
      });

      proposals.push(proposal);
      log.info(
        { proposalId: proposal.id, field: stat.fieldName, answerRate: stat.answerRate },
        'Created change_priority proposal',
      );
    }
  }

  log.info(
    { totalProposals: proposals.length, domainSchemaId },
    'Proposal generation complete',
  );

  return proposals;
}
