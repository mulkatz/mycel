import type { PersonaOutput } from '@mycel/shared/src/types/agent.types.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { PersonaResultSchema, PersonaResultJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:persona');

export function createPersonaNode(
  personaConfig: PersonaConfig,
  llmClient: LlmClient,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    log.info(
      { sessionId: state.sessionId, persona: personaConfig.name },
      'Generating persona response',
    );

    const gaps = state.gapReasoningOutput?.result.gaps ?? [];
    const followUpQuestions = state.gapReasoningOutput?.result.followUpQuestions ?? [];

    const gapSummary =
      gaps.length > 0
        ? gaps.map((g) => `- ${g.field} (${g.priority}): ${g.description}`).join('\n')
        : 'No gaps identified.';

    const questionSummary =
      followUpQuestions.length > 0
        ? followUpQuestions.map((q) => `- ${q}`).join('\n')
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
1. Acknowledges what the user shared
2. Asks follow-up questions to fill gaps (max ${String(personaConfig.promptBehavior.maxFollowUpQuestions)} questions)
${personaConfig.promptBehavior.encourageStorytelling ? '3. Encourages the user to share more stories and details' : ''}

Respond with a JSON object containing:
- response: your persona response text
- followUpQuestions: array of follow-up questions

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
        followUpQuestions: result.followUpQuestions,
      },
      confidence: 1.0,
    };

    log.info({ sessionId: state.sessionId }, 'Persona response generated');

    return { personaOutput };
  };
}
