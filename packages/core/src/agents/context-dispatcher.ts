import type {
  AgentInput,
  AgentOutput,
  ClassifierOutput,
} from '@mycel/shared/src/types/agent.types.js';
import type { KnowledgeSearchResult } from '@mycel/shared/src/types/knowledge.types.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('agent:context-dispatcher');

export interface ContextDispatcherOutput extends AgentOutput {
  readonly agentRole: 'context-dispatcher';
  readonly result: {
    readonly relevantContext: readonly KnowledgeSearchResult[];
    readonly contextSummary: string;
  };
}

export interface ContextDispatcherAgent {
  dispatch(input: AgentInput, classification: ClassifierOutput): Promise<ContextDispatcherOutput>;
}

export function createContextDispatcherAgent(): ContextDispatcherAgent {
  return {
    dispatch(
      input: AgentInput,
      classification: ClassifierOutput,
    ): Promise<ContextDispatcherOutput> {
      log.info(
        { sessionId: input.sessionId, categoryId: classification.result.categoryId },
        'Dispatching context retrieval',
      );

      // TODO: Integrate with Vector Search for RAG retrieval
      throw new AgentError('Context dispatcher agent not yet implemented');
    },
  };
}
