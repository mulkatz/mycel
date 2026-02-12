import type { GapReasoningOutput } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { FieldStatsRepository } from '../repositories/field-stats.repository.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';
import { GapReasoningResultSchema, GapReasoningResultJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:gap-reasoning');

const UNCATEGORIZED = '_uncategorized';
const MAX_FOLLOW_UP_QUESTIONS = 3;

export function createGapReasoningNode(
  domainConfig: DomainConfig,
  llmClient: LlmClient,
  fieldStatsRepository?: FieldStatsRepository,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    const categoryId = state.classifierOutput?.result.categoryId;
    const intent = state.classifierOutput?.result.intent;

    if (!categoryId) {
      throw new AgentError('Gap reasoning requires classifier output with a categoryId');
    }

    log.info({ sessionId: state.sessionId, categoryId, intent }, 'Analyzing knowledge gaps');

    // For greeting intent, return empty gaps (this node shouldn't run for greetings
    // but handle gracefully if it does)
    if (intent === 'greeting') {
      const gapReasoningOutput: GapReasoningOutput = {
        agentRole: 'gap-reasoning',
        result: { gaps: [], followUpQuestions: [] },
        confidence: 1.0,
        reasoning: 'No gap analysis needed for greeting.',
      };
      return { gapReasoningOutput };
    }

    const isUncategorized = categoryId === UNCATEGORIZED;

    const contextSummary =
      state.contextDispatcherOutput?.result.contextSummary ?? 'No context available.';
    const hasRetrievedContext =
      (state.contextDispatcherOutput?.result.relevantContext.length ?? 0) > 0;

    const skippedFields = state.turnContext?.skippedFields ?? [];

    let skippedFieldsContext = '';
    if (skippedFields.length > 0) {
      skippedFieldsContext = `
[SKIPPED TOPICS]
The user has already said they don't know about these topics — do NOT ask about them again:
${skippedFields.map((f) => `- ${f}`).join('\n')}

Instead, ask about something completely different or a different category.
`;
    }

    let followUpContext = '';
    if (state.turnContext?.isFollowUp) {
      const prevTurns = state.turnContext.previousTurns
        .map(
          (t) =>
            `Turn ${String(t.turnNumber)}: User said: "${t.userInput}" | Gaps: ${t.gaps.join(', ') || 'none'} | Filled: ${t.filledFields.join(', ') || 'none'}`,
        )
        .join('\n');

      const existingData = state.turnContext.previousEntry?.structuredData;
      const dataStr = existingData ? JSON.stringify(existingData) : 'none';

      followUpContext = `
[FOLLOW_UP_CONTEXT]
This is follow-up turn ${String(state.turnContext.turnNumber)}. The user is providing additional information.

Previous turns:
${prevTurns}

Existing structured data: ${dataStr}

Focus ONLY on remaining gaps that have not been filled yet.
`;
    }

    let systemPrompt: string;

    // Proactive request mode: analyze domain-wide coverage
    if (intent === 'proactive_request') {
      const categoryList = domainConfig.categories
        .map((c) => {
          const fields = [
            ...(c.requiredFields ?? []),
            ...(c.optionalFields ?? []),
          ];
          return `- ${c.id}: ${c.label} — ${c.description}${fields.length > 0 ? ` (fields: ${fields.join(', ')})` : ''}`;
        })
        .join('\n');

      systemPrompt = `You are analyzing which knowledge areas need more coverage. The user has asked you to ask them questions.

Available categories:
${categoryList}

## What Is Already Known
${contextSummary}
${skippedFieldsContext}
Based on what is already known (above), identify which categories have the LEAST coverage or are completely empty.
Generate 1-2 natural questions about the weakest areas. These should be conversational and specific — not generic "tell me about X" but specific, curious questions like "Gibt es in der Gegend eigentlich Vereine? Einen Sportverein oder eine Freiwillige Feuerwehr vielleicht?"

Rules:
- Focus on categories with ZERO or very few entries
- If all categories have some coverage, ask about depth/details in the weakest one
- Questions should feel natural, like a curious local would ask
- Maximum 2 questions
- For gaps, use the category id as the field name

Respond with a JSON object containing:
- gaps: array of { field, description, priority } — the weakest knowledge areas
- followUpQuestions: array of strings (max 2)
- reasoning: brief explanation of your analysis`;
    } else if (intent === 'dont_know') {
      // Don't know mode: find alternative topics to ask about
      const allGapsSkipped = skippedFields.length > 0;
      const category = domainConfig.categories.find((c) => c.id === categoryId);
      const otherCategories = domainConfig.categories
        .filter((c) => c.id !== categoryId)
        .map((c) => `- ${c.id}: ${c.label} — ${c.description}`)
        .join('\n');

      systemPrompt = `You are a gap-reasoning agent. The user just said they don't know the answer to a previous question.

Current category: ${category?.label ?? categoryId}
${otherCategories.length > 0 ? `\nOther available categories:\n${otherCategories}` : ''}

## Already Known
${contextSummary}
${skippedFieldsContext}
${followUpContext}
The user doesn't know about the last thing you asked. ${allGapsSkipped ? 'Multiple topics in this category have been skipped already.' : ''}

Rules:
- Do NOT ask about skipped topics again
- ${allGapsSkipped ? 'Suggest switching to a DIFFERENT category entirely' : 'Try a different angle within the current category, or suggest a different category'}
- Generate at most 1 follow-up question about an unasked topic
- If there's truly nothing left to ask, return empty gaps and questions

Respond with a JSON object containing:
- gaps: array of { field, description, priority }
- followUpQuestions: array of strings (max 1)
- reasoning: brief explanation`;
    } else if (isUncategorized) {
      const classifierSummary = state.classifierOutput?.result.summary ?? 'No summary available.';
      const suggestedLabel = state.classifierOutput?.result.suggestedCategoryLabel;

      systemPrompt = `You are a gap-reasoning and gap analysis agent in exploratory mode. The user's input did not fit any existing knowledge category.

Classifier summary: ${classifierSummary}
${suggestedLabel ? `Suggested topic area: ${suggestedLabel}` : ''}

## Already Known
${contextSummary}
${skippedFieldsContext}
${followUpContext}
Your task is to understand what the user is sharing and ask questions that help capture their knowledge more fully. You are NOT checking against a predefined list of fields.

Rules:
- NEVER ask about information already captured in "Already Known" above — treat it as settled knowledge
- ${hasRetrievedContext ? 'Generate follow-up questions that CONNECT the user\'s input to existing knowledge (e.g. if the user mentions a building near a known church, ask about the relationship between them — don\'t ask generic questions)' : 'Only ask about things the user is likely to know based on their input'}
- If they describe personal experience, ask about details of that experience
- If they share facts, ask about sources or related information
- Include one question that helps understand the broader topic area — something natural like "Is this something that happens regularly here?" or "Are there others who share this experience?" This helps the system understand if this is a recurring theme.
- If the input is already rich and detailed, it's fine to have few or no gaps
- Maximum ${String(MAX_FOLLOW_UP_QUESTIONS)} follow-up questions, ranked by most natural and likely-to-be-answered first
- For gaps, use descriptive field names that capture the nature of the missing information (e.g. "timeframe", "location", "personal_connection")

Respond with a JSON object containing:
- gaps: array of { field, description, priority } — use "medium" or "low" priority since there are no required schema fields
- followUpQuestions: array of strings (max ${String(MAX_FOLLOW_UP_QUESTIONS)})
- reasoning: brief explanation of your analysis

Example response:
{"gaps": [{"field": "timeframe", "description": "When did this happen or when does this typically occur?", "priority": "medium"}, {"field": "location", "description": "Where exactly does this take place?", "priority": "medium"}], "followUpQuestions": ["When did this happen?", "Where exactly was this?", "Is this something that happens regularly here?"], "reasoning": "The input describes a personal experience but lacks temporal and spatial context."}`;
    } else {
      const category = domainConfig.categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new AgentError(`Unknown category: ${categoryId}`);
      }

      const requiredFields = category.requiredFields ?? [];
      const optionalFields = category.optionalFields ?? [];

      let fieldStatsContext = '';
      if (fieldStatsRepository) {
        try {
          const stats = await fieldStatsRepository.getByCategory(domainConfig.name, categoryId);
          const relevantStats = stats.filter((s) => s.timesAsked >= 5);
          if (relevantStats.length > 0) {
            const lines = relevantStats
              .sort((a, b) => a.answerRate - b.answerRate)
              .map(
                (s) =>
                  `- ${s.fieldName}: ${String(Math.round(s.answerRate * 100))}% (${String(s.timesAnswered)}/${String(s.timesAsked)})`,
              );
            fieldStatsContext = `
[FIELD_STATS]
Answer rates for fields in this category (consider deprioritizing very low rates):
${lines.join('\n')}
`;
          }
        } catch (error) {
          log.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              categoryId,
            },
            'Failed to load field stats for gap reasoning',
          );
        }
      }

      systemPrompt = `You are a gap-reasoning and gap analysis agent. Analyze the user's input for a knowledge entry in the "${category.label}" category.

Required fields for this category: ${requiredFields.length > 0 ? requiredFields.join(', ') : 'none'}
Optional fields for this category: ${optionalFields.length > 0 ? optionalFields.join(', ') : 'none'}
${fieldStatsContext}
## Already Known
${contextSummary}
${skippedFieldsContext}
${followUpContext}
Identify what information is missing or incomplete. For each gap, specify the field name, a description of what is missing, and a priority (high for required fields, medium/low for optional).

Rules:
- NEVER ask about information already captured in "Already Known" above — treat it as settled knowledge
- ${hasRetrievedContext ? 'Generate follow-up questions that CONNECT the user\'s input to existing knowledge (e.g. if the user mentions a building near a known church, ask about the relationship between them — don\'t ask generic questions)' : 'Only ask about things the user is likely to know based on their input'}
- If the input is already rich and detailed, return fewer or no gaps — don't manufacture questions
- Rank questions by likelihood the user can answer them, not just by schema field priority
- Never ask about things that require specialized expertise the user hasn't demonstrated
- Maximum ${String(MAX_FOLLOW_UP_QUESTIONS)} follow-up questions

Respond with a JSON object containing:
- gaps: array of { field, description, priority }
- followUpQuestions: array of strings (max ${String(MAX_FOLLOW_UP_QUESTIONS)})
- reasoning: brief explanation of your analysis

Example response:
{"gaps": [{"field": "period", "description": "The exact time period is unclear", "priority": "high"}], "followUpQuestions": ["Can you specify the exact time period?"], "reasoning": "The user mentioned a historical event but did not specify when it occurred."}`;
    }

    log.info(
      {
        sessionId: state.sessionId,
        hasRetrievedContext,
        relevantContextCount: state.contextDispatcherOutput?.result.relevantContext.length ?? 0,
        contextSummary,
        intent,
        skippedFieldsCount: skippedFields.length,
      },
      'Gap reasoning prompt: context injection',
    );

    const result = await invokeAndValidate({
      llmClient,
      request: {
        systemPrompt,
        userMessage: state.input.content,
        jsonSchema: GapReasoningResultJsonSchema as Record<string, unknown>,
      },
      schema: GapReasoningResultSchema,
      agentName: 'Gap reasoning',
    });

    const gapReasoningOutput: GapReasoningOutput = {
      agentRole: 'gap-reasoning',
      result: {
        gaps: result.gaps,
        followUpQuestions: result.followUpQuestions.slice(0, MAX_FOLLOW_UP_QUESTIONS),
      },
      confidence: 1.0,
      reasoning: result.reasoning,
    };

    log.info(
      {
        sessionId: state.sessionId,
        gapCount: result.gaps.length,
        questionCount: gapReasoningOutput.result.followUpQuestions.length,
      },
      'Gap analysis complete',
    );

    return { gapReasoningOutput };
  };
}
