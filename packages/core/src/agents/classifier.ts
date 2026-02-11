import type { ClassifierOutput } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';
import { ClassifierResultSchema, ClassifierResultJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:classifier');

const UNCATEGORIZED = '_uncategorized';

export function createClassifierNode(
  domainConfig: DomainConfig,
  llmClient: LlmClient,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  const categories = domainConfig.categories;
  const categoryIds = categories.map((c) => c.id);
  const primaryLanguage = domainConfig.ingestion.primaryLanguage;

  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    log.info({ sessionId: state.sessionId }, 'Classifying input');

    if (state.turnContext?.isFollowUp && state.classifierOutput) {
      log.info(
        { sessionId: state.sessionId },
        'Follow-up turn: reusing existing classification',
      );
      return {};
    }

    if (categories.length === 0) {
      throw new AgentError('No categories configured in domain schema');
    }

    const categoryList = categories
      .map((c) => `- ${c.id}: ${c.label} — ${c.description}`)
      .join('\n');

    const systemPrompt = `You are a classifier agent. Your task is to classify user input into one of the following categories:

${categoryList}

If the input does not clearly fit any category, classify it as "${UNCATEGORIZED}". It is better to be honest about uncertainty than to force a bad classification. Use "${UNCATEGORIZED}" when your confidence would be below 0.6 for any existing category.

When classifying as "${UNCATEGORIZED}":
- Set confidence to your actual confidence level (which will be low)
- Provide a short "summary" describing what the input is about
- Provide a "suggestedCategoryLabel" — your best guess at what a NEW category might be called for this type of input (e.g. "Fishing", "Childhood Memories", "Local Recipes"). Use ${primaryLanguage} for the label.

Respond with a JSON object containing:
- categoryId: the ID of the best matching category, or "${UNCATEGORIZED}"
- subcategoryId: optional subcategory if applicable
- confidence: a number between 0 and 1 indicating your confidence
- reasoning: a brief explanation of your classification
- summary: (only for ${UNCATEGORIZED}) a short description of what the input is about
- suggestedCategoryLabel: (only for ${UNCATEGORIZED}) your best guess for a new category name in ${primaryLanguage}

Example response for a matching category:
{"categoryId": "history", "subcategoryId": null, "confidence": 0.92, "reasoning": "The input discusses historical events from the 18th century."}

Example response for uncategorized input:
{"categoryId": "${UNCATEGORIZED}", "confidence": 0.3, "reasoning": "The input describes personal childhood memories that don't fit existing categories.", "summary": "Personal childhood memory about summers in the village", "suggestedCategoryLabel": "Childhood Memories"}`;

    const result = await invokeAndValidate({
      llmClient,
      request: {
        systemPrompt,
        userMessage: state.input.content,
        jsonSchema: ClassifierResultJsonSchema as Record<string, unknown>,
      },
      schema: ClassifierResultSchema,
      agentName: 'Classifier',
    });

    if (result.categoryId !== UNCATEGORIZED && !categoryIds.includes(result.categoryId)) {
      throw new AgentError(
        `Classifier returned unknown categoryId: ${result.categoryId}. Valid IDs: ${categoryIds.join(', ')}, ${UNCATEGORIZED}`,
      );
    }

    const classifierOutput: ClassifierOutput = {
      agentRole: 'classifier',
      result: {
        categoryId: result.categoryId,
        subcategoryId: result.subcategoryId,
        confidence: result.confidence,
        summary: result.summary,
        suggestedCategoryLabel: result.suggestedCategoryLabel,
      },
      confidence: result.confidence,
      reasoning: result.reasoning,
    };

    log.info(
      { sessionId: state.sessionId, categoryId: result.categoryId, confidence: result.confidence },
      'Classification complete',
    );

    return { classifierOutput };
  };
}
