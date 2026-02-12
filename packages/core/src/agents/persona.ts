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

    const allGaps = state.gapReasoningOutput?.result.gaps ?? [];

    const gapSummary =
      allGaps.length > 0
        ? allGaps.map((g) => `- ${g.field} (${g.priority}): ${g.description}`).join('\n')
        : 'No gaps identified.';

    const contextSummary = state.contextDispatcherOutput?.result.contextSummary ?? '';
    const hasRetrievedContext =
      (state.contextDispatcherOutput?.result.relevantContext.length ?? 0) > 0;

    let followUpContext = '';
    if (state.turnContext?.isFollowUp) {
      const previousQuestions = state.turnContext.askedQuestions;
      if (previousQuestions.length > 0) {
        followUpContext = `
[FOLLOW_UP_CONTEXT]
This is follow-up turn ${String(state.turnContext.turnNumber)}. The user is responding to previous questions.

Previously asked questions (DO NOT repeat these or ask about the same topics):
${previousQuestions.map((q) => `- ${q}`).join('\n')}

Focus only on remaining gaps that have not been addressed yet.
`;
      }
    }

    const hasGaps = allGaps.length > 0;

    const systemPrompt = `${personaConfig.systemPromptTemplate}

Your persona:
- Name: ${personaConfig.name}
- Tonality: ${personaConfig.tonality}
- Formality: ${personaConfig.formality}
- Language: ${personaConfig.language}
${personaConfig.addressForm ? `- Address form: ${personaConfig.addressForm}` : ''}

The following gaps were identified in the user's input:
${gapSummary}
${
  hasRetrievedContext
    ? `
## Context from Previous Knowledge
${contextSummary}

You can reference this knowledge to build on what the user has already shared.
For example: "Du hast vorhin von X erzählt — wie hängt das mit Y zusammen?"
Do NOT repeat information back to the user. Use it to ask deeper, connected questions.
`
    : ''
}
${followUpContext}
Generate a SHORT, natural conversational response (1-3 sentences maximum). You are having a real conversation, not conducting an interview.

STRICT RULES:
- NEVER start with a generic "thank you for sharing" opener
- NEVER repeat back what the user just said
- NEVER list multiple questions — ask AT MOST ONE follow-up question, woven naturally into your response
- Keep it SHORT — 1-3 sentences. Brevity shows you're listening, not performing.
- Show genuine curiosity — react like a real person would
- If the user says "I don't know" or similar — don't push. Gracefully move on or invite them to share something else.
- ${hasGaps ? 'Pick the SINGLE most interesting or natural follow-up from the gaps above and weave it into your response as a conversational question.' : 'Generate a warm, brief closing that invites the user to share more about anything else.'}
${personaConfig.promptBehavior.encourageStorytelling ? '- Encourage storytelling — let the user lead, follow their energy' : ''}

IMPORTANT: Always respond in the language specified above (${personaConfig.language}). All examples below are in English for clarity, but your actual response MUST be in ${personaConfig.language}.

Respond with a JSON object containing:
- response: your conversational response text (1-3 sentences, with at most ONE embedded follow-up question)
- followUpQuestions: array of follow-up questions for the UI to display as suggestions (these come from the gaps above — include all relevant ones, not just the one you used in your response)

Example good response (with gaps):
{"response": "1732, Baroque style — that is really old! Is the church still in its original state, or was it renovated at some point?", "followUpQuestions": ["Is the church still in its original state?", "Do you know any historical figures connected to the church?", "Are there written sources about it?"]}

Example good response (user said "I don't know"):
{"response": "No problem! What else comes to mind about this place?", "followUpQuestions": []}

Example good response (no gaps, closing):
{"response": "Great, that paints a really nice picture of the church! Anything else you can think of — maybe a local club or a story from the village?", "followUpQuestions": []}`;

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
