import type { PersonaOutput } from '@mycel/shared/src/types/agent.types.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { PersonaResultSchema, PersonaResultJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:persona');

const MAX_GAPS_TO_PRESENT = 3;

export function createPersonaNode(
  personaConfig: PersonaConfig,
  llmClient: LlmClient,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    log.info(
      { sessionId: state.sessionId, persona: personaConfig.name },
      'Generating persona response',
    );

    const allGaps = state.gapReasoningOutput?.result.gaps ?? [];
    const allFollowUpQuestions = state.gapReasoningOutput?.result.followUpQuestions ?? [];

    const topGaps = allGaps.slice(0, MAX_GAPS_TO_PRESENT);
    const topQuestions = allFollowUpQuestions.slice(0, MAX_GAPS_TO_PRESENT);

    const gapSummary =
      topGaps.length > 0
        ? topGaps.map((g) => `- ${g.field} (${g.priority}): ${g.description}`).join('\n')
        : 'No gaps identified.';

    const questionSummary =
      topQuestions.length > 0
        ? topQuestions.map((q) => `- ${q}`).join('\n')
        : 'No follow-up questions needed.';

    let followUpContext = '';
    if (state.turnContext?.isFollowUp) {
      const previousQuestions = state.turnContext.askedQuestions;
      if (previousQuestions.length > 0) {
        followUpContext = `
[FOLLOW_UP_CONTEXT]
This is follow-up turn ${String(state.turnContext.turnNumber)}. The user is responding to previous questions.

Previously asked questions (DO NOT repeat these):
${previousQuestions.map((q) => `- ${q}`).join('\n')}

Acknowledge the new information and only ask about remaining gaps.
`;
      }
    }

    const hasGaps = topGaps.length > 0;
    const maxQuestions = Math.min(
      personaConfig.promptBehavior.maxFollowUpQuestions,
      MAX_GAPS_TO_PRESENT,
    );

    const systemPrompt = `${personaConfig.systemPromptTemplate}

Your persona:
- Name: ${personaConfig.name}
- Tonality: ${personaConfig.tonality}
- Formality: ${personaConfig.formality}
- Language: ${personaConfig.language}
${personaConfig.addressForm ? `- Address form: ${personaConfig.addressForm}` : ''}

The following gaps were identified in the user's input:
${gapSummary}

Suggested follow-up questions:
${questionSummary}
${followUpContext}
Generate a persona-appropriate response that:
1. Reflects back what you learned from the user's input — make them feel heard and valued
2. ${hasGaps ? `Asks follow-up questions to fill gaps (max ${String(maxQuestions)} questions)` : 'Generates a warm closing message thanking the user for their contribution. Do NOT force follow-up questions if there are no gaps.'}
${personaConfig.promptBehavior.encourageStorytelling ? '3. Encourages the user to share more stories and details' : ''}

Respond with a JSON object containing:
- response: your persona response text
- followUpQuestions: array of follow-up questions (empty array if no gaps)

Example response:
{"response": "Thank you for sharing this fascinating story! I'd love to learn more details.", "followUpQuestions": ["Can you tell me more about the time period?", "Do you have any written sources about this?"]}`;

    const result = await invokeAndValidate({
      llmClient,
      request: {
        systemPrompt,
        userMessage: state.input.content,
        jsonSchema: PersonaResultJsonSchema as Record<string, unknown>,
      },
      schema: PersonaResultSchema,
      agentName: 'Persona',
    });

    const personaOutput: PersonaOutput = {
      agentRole: 'persona',
      result: {
        response: result.response,
        followUpQuestions: result.followUpQuestions.slice(0, maxQuestions),
      },
      confidence: 1.0,
    };

    log.info({ sessionId: state.sessionId }, 'Persona response generated');

    return { personaOutput };
  };
}
