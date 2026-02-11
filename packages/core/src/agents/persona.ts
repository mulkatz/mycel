import type {
  AgentInput,
  AgentOutput,
  GapReasoningOutput,
} from '@mycel/shared/src/types/agent.types.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('agent:persona');

export interface PersonaOutput extends AgentOutput {
  readonly agentRole: 'persona';
  readonly result: {
    readonly response: string;
    readonly followUpQuestions: readonly string[];
  };
}

export interface PersonaAgent {
  respond(input: AgentInput, gaps: GapReasoningOutput): Promise<PersonaOutput>;
}

export function createPersonaAgent(personaConfig: PersonaConfig): PersonaAgent {
  return {
    respond(input: AgentInput, _gaps: GapReasoningOutput): Promise<PersonaOutput> {
      log.info(
        { sessionId: input.sessionId, persona: personaConfig.name },
        'Generating persona response',
      );

      // TODO: Integrate with Vertex AI using persona system prompt
      throw new AgentError('Persona agent not yet implemented');
    },
  };
}
