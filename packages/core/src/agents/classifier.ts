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

    if (categories.length === 0) {
      throw new AgentError('No categories configured in domain schema');
    }

    const categoryList = categories
      .map((c) => `- ${c.id}: ${c.label} — ${c.description}`)
      .join('\n');

    let sessionContext = '';
    if (state.turnContext?.isFollowUp && state.activeCategory) {
      const lastQuestion = state.turnContext.askedQuestions.at(-1) ?? '';
      sessionContext = `
[SESSION_CONTEXT]
The user is currently in a conversation about the topic "${state.activeCategory}".
${lastQuestion ? `The last question asked to the user was: "${lastQuestion}"` : ''}

IMPORTANT: Determine if the user is:
a) Responding to the current topic (even if saying "I don't know" or "no") → set isTopicChange: false
b) Introducing a completely new, different subject → set isTopicChange: true

A response like "I don't know", "no", "not sure" is NOT a topic change — it's a response within the current topic.
Only set isTopicChange to true if the user is clearly talking about something entirely different.
`;
    }

    const systemPrompt = `You are a classifier agent. Your task is to classify user input into one of the following categories:

${categoryList}

If the input does not clearly fit any category, classify it as "${UNCATEGORIZED}". It is better to be honest about uncertainty than to force a bad classification. Use "${UNCATEGORIZED}" when your confidence would be below 0.6 for any existing category.

When classifying as "${UNCATEGORIZED}":
- Set confidence to your actual confidence level (which will be low)
- Provide a short "summary" describing what the input is about
- Provide a "suggestedCategoryLabel" — your best guess at what a NEW category might be called for this type of input (e.g. "Fishing", "Childhood Memories", "Local Recipes"). Use ${primaryLanguage} for the label.
${sessionContext}
Respond with a JSON object containing:
- categoryId: the ID of the best matching category, or "${UNCATEGORIZED}"
- subcategoryId: optional subcategory if applicable
- confidence: a number between 0 and 1 indicating your confidence
- isTopicChange: boolean — whether the user changed to a new topic (only relevant for follow-up turns, set false for first turns)
- reasoning: a brief explanation of your classification
- summary: (only for ${UNCATEGORIZED}) a short description of what the input is about
- suggestedCategoryLabel: (only for ${UNCATEGORIZED}) your best guess for a new category name in ${primaryLanguage}

Example response for a matching category:
{"categoryId": "history", "subcategoryId": null, "confidence": 0.92, "isTopicChange": false, "reasoning": "The input discusses historical events from the 18th century."}

Example response for uncategorized input:
{"categoryId": "${UNCATEGORIZED}", "confidence": 0.3, "isTopicChange": false, "reasoning": "The input describes personal childhood memories that don't fit existing categories.", "summary": "Personal childhood memory about summers in the village", "suggestedCategoryLabel": "Childhood Memories"}

Example response for a topic change:
{"categoryId": "nature", "confidence": 0.85, "isTopicChange": true, "reasoning": "The user was previously discussing history but is now talking about a lake, which is a nature topic."}`;

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
        isTopicChange: result.isTopicChange,
        summary: result.summary,
        suggestedCategoryLabel: result.suggestedCategoryLabel,
      },
      confidence: result.confidence,
      reasoning: result.reasoning,
    };

    log.info(
      {
        sessionId: state.sessionId,
        categoryId: result.categoryId,
        confidence: result.confidence,
        isTopicChange: result.isTopicChange,
      },
      'Classification complete',
    );

    return { classifierOutput };
  };
}
