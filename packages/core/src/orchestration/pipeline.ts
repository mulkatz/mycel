import type { AgentInput, PipelineState } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('orchestration:pipeline');

export interface PipelineConfig {
  readonly domainConfig: DomainConfig;
  readonly personaConfig: PersonaConfig;
}

export interface Pipeline {
  run(input: AgentInput): Promise<PipelineState>;
}

export function createPipeline(config: PipelineConfig): Pipeline {
  log.info(
    { domain: config.domainConfig.name, persona: config.personaConfig.name },
    'Initializing agent pipeline',
  );

  return {
    run(input: AgentInput): Promise<PipelineState> {
      log.info({ sessionId: input.sessionId }, 'Running agent pipeline');

      // TODO: Implement LangGraph.js workflow
      // The pipeline will orchestrate: Classifier → Context Dispatcher → Gap-Reasoning → Persona → Structuring
      return Promise.resolve({
        sessionId: input.sessionId,
        input,
      });
    },
  };
}
