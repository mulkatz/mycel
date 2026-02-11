import type { GapReasoningOutput } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';
import { GapReasoningResultSchema, GapReasoningResultJsonSchema } from './agent-output.schemas.js';

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

    const systemPrompt = `You are a gap-reasoning and gap analysis agent. Analyze the user's input for a knowledge entry in the "${category.label}" category.

Required fields for this category: ${requiredFields.length > 0 ? requiredFields.join(', ') : 'none'}
Optional fields for this category: ${optionalFields.length > 0 ? optionalFields.join(', ') : 'none'}

Existing context: ${contextSummary}

Identify what information is missing or incomplete. For each gap, specify the field name, a description of what is missing, and a priority (high for required fields, medium/low for optional).

Also generate follow-up questions that would help fill the identified gaps.

Respond with a JSON object containing:
- gaps: array of { field, description, priority }
- followUpQuestions: array of strings
- reasoning: brief explanation of your analysis`;

    const response = await llmClient.invoke({
      systemPrompt,
      userMessage: state.input.content,
      jsonSchema: GapReasoningResultJsonSchema as Record<string, unknown>,
    });

    const parsed = GapReasoningResultSchema.safeParse(JSON.parse(response.content));
    if (!parsed.success) {
      throw new AgentError(
        `Gap reasoning returned invalid output: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      );
    }

    const result = parsed.data;

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
