import type { ContextDispatcherOutput } from '@mycel/shared/src/types/agent.types.js';
import type { KnowledgeSearchResult } from '@mycel/shared/src/types/knowledge.types.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { EmbeddingClient } from '../embedding/embedding-client.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js';
import { buildInputEmbeddingText } from '../embedding/embedding-text-builder.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('agent:context-dispatcher');

export interface ContextDispatcherDeps {
  readonly embeddingClient?: EmbeddingClient;
  readonly knowledgeRepository?: KnowledgeRepository;
  readonly domainSchemaId: string;
}

function buildContextSummary(results: readonly KnowledgeSearchResult[]): string {
  if (results.length === 0) {
    return 'No related knowledge found in previous sessions.';
  }

  const entries = results
    .map((r) => {
      const category = r.entry.categoryId !== '_uncategorized' ? `[${r.entry.categoryId}] ` : '';
      const content =
        r.entry.content.length > 150 ? r.entry.content.slice(0, 150) + '...' : r.entry.content;
      return `- ${category}${r.entry.title} (relevance: ${r.score.toFixed(2)}): ${content}`;
    })
    .join('\n');

  return `Related knowledge already captured:\n${entries}`;
}

export function createContextDispatcherNode(
  deps?: ContextDispatcherDeps,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    log.info(
      {
        sessionId: state.sessionId,
        categoryId: state.classifierOutput?.result.categoryId,
      },
      'Dispatching context retrieval',
    );

    // Fall back to stub when deps are not provided
    if (!deps?.embeddingClient || !deps.knowledgeRepository) {
      const contextDispatcherOutput: ContextDispatcherOutput = {
        agentRole: 'context-dispatcher',
        result: {
          relevantContext: [],
          contextSummary: 'No existing context available (vector search not configured).',
        },
        confidence: 1.0,
      };

      log.info({ sessionId: state.sessionId }, 'Context dispatch complete (no embedding client)');
      return { contextDispatcherOutput };
    }

    let relevantContext: readonly KnowledgeSearchResult[] = [];

    try {
      const categoryId = state.classifierOutput?.result.categoryId;
      const inputText = buildInputEmbeddingText(state.input.content, categoryId);
      const embedding = await deps.embeddingClient.generateEmbedding(inputText);

      relevantContext = await deps.knowledgeRepository.searchSimilar({
        domainSchemaId: deps.domainSchemaId,
        embedding,
        limit: 5,
        excludeSessionId: state.sessionId,
      });

      log.info(
        {
          sessionId: state.sessionId,
          resultsFound: relevantContext.length,
        },
        'Vector search complete',
      );
    } catch (error) {
      log.warn(
        {
          sessionId: state.sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Context retrieval failed, continuing without context',
      );
    }

    const contextSummary = buildContextSummary(relevantContext);

    const contextDispatcherOutput: ContextDispatcherOutput = {
      agentRole: 'context-dispatcher',
      result: {
        relevantContext: [...relevantContext],
        contextSummary,
      },
      confidence: 1.0,
    };

    log.info({ sessionId: state.sessionId }, 'Context dispatch complete');

    return { contextDispatcherOutput };
  };
}
