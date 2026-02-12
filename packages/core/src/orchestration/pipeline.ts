import { StateGraph, START, END } from '@langchain/langgraph';
import type { AgentInput, PipelineState } from '@mycel/shared/src/types/agent.types.js';
import type { TurnContext } from '@mycel/shared/src/types/session.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import type { EmbeddingClient } from '../embedding/embedding-client.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js';
import type { FieldStatsRepository } from '../repositories/field-stats.repository.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { PipelineGraphAnnotation, type PipelineGraphState } from './pipeline-state.js';
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
  readonly embeddingClient?: EmbeddingClient;
  readonly knowledgeRepository?: KnowledgeRepository;
  readonly fieldStatsRepository?: FieldStatsRepository;
}

export interface PipelineRunOptions {
  readonly turnContext?: TurnContext;
  readonly activeCategory?: string;
}

export interface Pipeline {
  run(input: AgentInput, options?: PipelineRunOptions): Promise<PipelineState>;
}

function routeAfterClassifier(state: PipelineGraphState): string {
  const intent = state.classifierOutput?.result.intent;
  if (intent === 'greeting') {
    return 'persona';
  }
  return 'contextDispatcher';
}

function routeAfterPersona(state: PipelineGraphState): string {
  const intent = state.classifierOutput?.result.intent;
  if (intent === 'greeting' || intent === 'proactive_request' || intent === 'dont_know') {
    return '__end__';
  }
  return 'structuring';
}

export function createPipeline(config: PipelineConfig): Pipeline {
  log.info(
    { domain: config.domainConfig.name, persona: config.personaConfig.name },
    'Initializing agent pipeline',
  );

  const classifierNode = createClassifierNode(config.domainConfig, config.llmClient);
  const contextDispatcherNode = createContextDispatcherNode({
    embeddingClient: config.embeddingClient,
    knowledgeRepository: config.knowledgeRepository,
    domainSchemaId: config.domainConfig.name,
  });
  const gapReasoningNode = createGapReasoningNode(config.domainConfig, config.llmClient, config.fieldStatsRepository);
  const personaNode = createPersonaNode(config.personaConfig, config.llmClient);
  const structuringNode = createStructuringNode(config.domainConfig, config.llmClient);

  const graph = new StateGraph(PipelineGraphAnnotation)
    .addNode('classifier', classifierNode)
    .addNode('contextDispatcher', contextDispatcherNode)
    .addNode('gapReasoning', gapReasoningNode)
    .addNode('persona', personaNode)
    .addNode('structuring', structuringNode)
    .addEdge(START, 'classifier')
    .addConditionalEdges('classifier', routeAfterClassifier, {
      persona: 'persona',
      contextDispatcher: 'contextDispatcher',
    })
    .addEdge('contextDispatcher', 'gapReasoning')
    .addEdge('gapReasoning', 'persona')
    .addConditionalEdges('persona', routeAfterPersona, {
      structuring: 'structuring',
      __end__: END,
    })
    .addEdge('structuring', END)
    .compile();

  return {
    async run(input: AgentInput, options?: PipelineRunOptions): Promise<PipelineState> {
      log.info(
        { sessionId: input.sessionId, isFollowUp: options?.turnContext?.isFollowUp },
        'Running agent pipeline',
      );

      const result = await graph.invoke({
        sessionId: input.sessionId,
        input,
        classifierOutput: undefined,
        contextDispatcherOutput: undefined,
        gapReasoningOutput: undefined,
        personaOutput: undefined,
        structuringOutput: undefined,
        turnContext: options?.turnContext,
        activeCategory: options?.activeCategory,
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
        turnContext: result.turnContext,
        activeCategory: result.activeCategory,
      };
    },
  };
}
