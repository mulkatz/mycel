import { StateGraph, START, END } from '@langchain/langgraph';
import type { AgentInput, PipelineState } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { PipelineGraphAnnotation } from './pipeline-state.js';
import { createClassifierNode } from '../agents/classifier.js';
import { createContextDispatcherNode } from '../agents/context-dispatcher.js';
import { createGapReasoningNode } from '../agents/gap-reasoning.js';
import { createPersonaNode } from '../agents/persona.js';
import { createStructuringNode } from '../agents/structuring.js';

const log = createChildLogger('orchestration:pipeline');

export interface PipelineConfig {
  readonly domainConfig: DomainConfig;
  readonly personaConfig: PersonaConfig;
  readonly llmClient: LlmClient;
}

export interface Pipeline {
  run(input: AgentInput): Promise<PipelineState>;
}

export function createPipeline(config: PipelineConfig): Pipeline {
  log.info(
    { domain: config.domainConfig.name, persona: config.personaConfig.name },
    'Initializing agent pipeline',
  );

  const classifierNode = createClassifierNode(config.domainConfig, config.llmClient);
  const contextDispatcherNode = createContextDispatcherNode();
  const gapReasoningNode = createGapReasoningNode(config.domainConfig, config.llmClient);
  const personaNode = createPersonaNode(config.personaConfig, config.llmClient);
  const structuringNode = createStructuringNode(config.domainConfig, config.llmClient);

  const graph = new StateGraph(PipelineGraphAnnotation)
    .addNode('classifier', classifierNode)
    .addNode('contextDispatcher', contextDispatcherNode)
    .addNode('gapReasoning', gapReasoningNode)
    .addNode('persona', personaNode)
    .addNode('structuring', structuringNode)
    .addEdge(START, 'classifier')
    .addEdge('classifier', 'contextDispatcher')
    .addEdge('contextDispatcher', 'gapReasoning')
    .addEdge('gapReasoning', 'persona')
    .addEdge('persona', 'structuring')
    .addEdge('structuring', END)
    .compile();

  return {
    async run(input: AgentInput): Promise<PipelineState> {
      log.info({ sessionId: input.sessionId }, 'Running agent pipeline');

      const result = await graph.invoke({
        sessionId: input.sessionId,
        input,
        classifierOutput: undefined,
        contextDispatcherOutput: undefined,
        gapReasoningOutput: undefined,
        personaOutput: undefined,
        structuringOutput: undefined,
      });

      log.info({ sessionId: input.sessionId }, 'Pipeline complete');

      return {
        sessionId: result.sessionId,
        input: result.input,
        classifierOutput: result.classifierOutput,
        contextDispatcherOutput: result.contextDispatcherOutput,
        gapReasoningOutput: result.gapReasoningOutput,
        personaOutput: result.personaOutput,
        structuringOutput: result.structuringOutput,
      };
    },
  };
}
