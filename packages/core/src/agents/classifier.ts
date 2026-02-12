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
const META = '_meta';

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

    const systemPrompt = `You are a classifier agent. Your FIRST task is to determine the user's INTENT, then classify if needed.

## Step 1: Determine Intent

Before anything else, determine the user's intent:

- "greeting": The user is greeting, making small talk, or saying something with no informational content.
  Examples: "hi", "hallo", "hey", "guten Tag", "moin", "servus", "hello", "what's up", "na?"
  → Set categoryId to "${META}", confidence to 1.0

- "proactive_request": The user is asking YOU to ask THEM questions or wants to know what information is still needed.
  Examples: "frag mich was", "frag mich etwas", "ask me something", "was willst du wissen?", "was fehlt noch?", "worüber willst du reden?", "was kann ich dir erzählen?", "stell mir eine Frage"
  → Set categoryId to "${META}", confidence to 1.0

- "dont_know": The user is saying they don't know the answer to a question (ONLY on follow-up turns when responding to a previous question).
  Examples: "weiß ich nicht", "keine Ahnung", "I don't know", "no idea", "not sure", "da bin ich überfragt", "kann ich nicht sagen", "weiß nicht"
  → Keep the current categoryId (use activeCategory from session context), set isTopicChange to false

- "content": The user is sharing actual knowledge, information, facts, stories, or descriptions.
  → Classify into one of the categories below

## Step 2: Classify (only for "content" intent)

Available categories:
${categoryList}

If the input does not clearly fit any category, classify it as "${UNCATEGORIZED}". Use "${UNCATEGORIZED}" when your confidence would be below 0.6 for any existing category.

When classifying as "${UNCATEGORIZED}":
- Set confidence to your actual confidence level (which will be low)
- Provide a short "summary" describing what the input is about
- Provide a "suggestedCategoryLabel" — your best guess for a new category name in ${primaryLanguage}

IMPORTANT: Only include "summary" and "suggestedCategoryLabel" when categoryId is "${UNCATEGORIZED}". For all other categories, do NOT include these fields.
${sessionContext}
Respond with a JSON object containing:
- categoryId: the category ID, "${UNCATEGORIZED}", or "${META}"
- subcategoryId: optional subcategory if applicable (null for non-content intents)
- confidence: a number between 0 and 1
- intent: one of "content", "greeting", "proactive_request", "dont_know"
- isTopicChange: boolean — whether the user changed to a new topic (only for follow-up turns, false otherwise)
- reasoning: a brief explanation
- summary: (only for ${UNCATEGORIZED}) short description of the input
- suggestedCategoryLabel: (only for ${UNCATEGORIZED}) suggested new category name in ${primaryLanguage}

Example for content:
{"categoryId": "history", "confidence": 0.92, "intent": "content", "isTopicChange": false, "reasoning": "Historical content about 18th century."}

Example for greeting:
{"categoryId": "${META}", "confidence": 1.0, "intent": "greeting", "isTopicChange": false, "reasoning": "User is greeting."}

Example for proactive request:
{"categoryId": "${META}", "confidence": 1.0, "intent": "proactive_request", "isTopicChange": false, "reasoning": "User wants to be asked questions."}

Example for don't know:
{"categoryId": "history", "confidence": 1.0, "intent": "dont_know", "isTopicChange": false, "reasoning": "User doesn't know the answer to the previous question about history."}

Example for uncategorized:
{"categoryId": "${UNCATEGORIZED}", "confidence": 0.3, "intent": "content", "isTopicChange": false, "reasoning": "Personal memory.", "summary": "Childhood summers in the village", "suggestedCategoryLabel": "Kindheitserinnerungen"}

Example for topic change:
{"categoryId": "nature", "confidence": 0.85, "intent": "content", "isTopicChange": true, "reasoning": "User switched from history to nature."}`;

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

    if (
      result.categoryId !== UNCATEGORIZED &&
      result.categoryId !== META &&
      !categoryIds.includes(result.categoryId)
    ) {
      throw new AgentError(
        `Classifier returned unknown categoryId: ${result.categoryId}. Valid IDs: ${categoryIds.join(', ')}, ${UNCATEGORIZED}, ${META}`,
      );
    }

    const classifierOutput: ClassifierOutput = {
      agentRole: 'classifier',
      result: {
        categoryId: result.categoryId,
        subcategoryId: result.subcategoryId,
        confidence: result.confidence,
        intent: result.intent,
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
        intent: result.intent,
        isTopicChange: result.isTopicChange,
      },
      'Classification complete',
    );

    return { classifierOutput };
  };
}
