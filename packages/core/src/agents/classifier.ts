import type { ClassifierOutput } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';
import { ClassifierResultSchema, ClassifierResultJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:classifier');

export function createClassifierNode(
  domainConfig: DomainConfig,
  llmClient: LlmClient,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  const categories = domainConfig.categories;
  const categoryIds = categories.map((c) => c.id);

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

Respond with a JSON object containing:
- categoryId: the ID of the best matching category
- subcategoryId: optional subcategory if applicable
- confidence: a number between 0 and 1 indicating your confidence
- reasoning: a brief explanation of your classification

Example response:
{"categoryId": "history", "subcategoryId": null, "confidence": 0.92, "reasoning": "The input discusses historical events from the 18th century."}`;

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

    if (!categoryIds.includes(result.categoryId)) {
      throw new AgentError(
        `Classifier returned unknown categoryId: ${result.categoryId}. Valid IDs: ${categoryIds.join(', ')}`,
      );
    }

    const classifierOutput: ClassifierOutput = {
      agentRole: 'classifier',
      result: {
        categoryId: result.categoryId,
        subcategoryId: result.subcategoryId,
        confidence: result.confidence,
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
