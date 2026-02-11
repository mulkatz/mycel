import type { ContextDispatcherOutput } from '@mycel/shared/src/types/agent.types.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('agent:context-dispatcher');

export function createContextDispatcherNode(): (
  state: PipelineGraphState,
) => Promise<Partial<PipelineGraphState>> {
  return (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    log.info(
      {
        sessionId: state.sessionId,
        categoryId: state.classifierOutput?.result.categoryId,
      },
      'Dispatching context retrieval',
    );

    const contextDispatcherOutput: ContextDispatcherOutput = {
      agentRole: 'context-dispatcher',
      result: {
        relevantContext: [],
        contextSummary: 'No existing context available (vector search not yet integrated).',
      },
      confidence: 1.0,
    };

    log.info({ sessionId: state.sessionId }, 'Context dispatch complete (stub)');

    return Promise.resolve({ contextDispatcherOutput });
  };
}
