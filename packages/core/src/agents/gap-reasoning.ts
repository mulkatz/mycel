import type { GapReasoningOutput } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';
import { GapReasoningResultSchema, GapReasoningResultJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:gap-reasoning');

export function createGapReasoningNode(
  domainConfig: DomainConfig,
  llmClient: LlmClient,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    const categoryId = state.classifierOutput?.result.categoryId;
    if (!categoryId) {
      throw new AgentError('Gap reasoning requires classifier output with a categoryId');
    }

    log.info({ sessionId: state.sessionId, categoryId }, 'Analyzing knowledge gaps');

    const category = domainConfig.categories.find((c) => c.id === categoryId);
    if (!category) {
      throw new AgentError(`Unknown category: ${categoryId}`);
    }

    const requiredFields = category.requiredFields ?? [];
    const optionalFields = category.optionalFields ?? [];

    const contextSummary =
      state.contextDispatcherOutput?.result.contextSummary ?? 'No context available.';

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

    const systemPrompt = `You are a gap-reasoning and gap analysis agent. Analyze the user's input for a knowledge entry in the "${category.label}" category.

Required fields for this category: ${requiredFields.length > 0 ? requiredFields.join(', ') : 'none'}
Optional fields for this category: ${optionalFields.length > 0 ? optionalFields.join(', ') : 'none'}

Existing context: ${contextSummary}
${followUpContext}
Identify what information is missing or incomplete. For each gap, specify the field name, a description of what is missing, and a priority (high for required fields, medium/low for optional).

Also generate follow-up questions that would help fill the identified gaps.

Respond with a JSON object containing:
- gaps: array of { field, description, priority }
- followUpQuestions: array of strings
- reasoning: brief explanation of your analysis

Example response:
{"gaps": [{"field": "period", "description": "The exact time period is unclear", "priority": "high"}], "followUpQuestions": ["Can you specify the exact time period?"], "reasoning": "The user mentioned a historical event but did not specify when it occurred."}`;

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
        followUpQuestions: result.followUpQuestions,
      },
      confidence: 1.0,
      reasoning: result.reasoning,
    };

    log.info(
      {
        sessionId: state.sessionId,
        gapCount: result.gaps.length,
        questionCount: result.followUpQuestions.length,
      },
      'Gap analysis complete',
    );

    return { gapReasoningOutput };
  };
}
