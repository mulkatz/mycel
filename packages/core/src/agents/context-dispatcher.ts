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

function buildContextSummary(
  results: readonly KnowledgeSearchResult[],
  currentSessionId: string,
): string {
  if (results.length === 0) {
    return 'No related knowledge found.';
  }

  const sameSession: string[] = [];
  const otherSession: string[] = [];

  for (const r of results) {
    const category = r.entry.categoryId !== '_uncategorized' ? `[${r.entry.categoryId}] ` : '';
    const content = r.entry.content;

    let enrichmentMarker = '';
    if (r.entry.enrichment?.claims) {
      const contradicted = r.entry.enrichment.claims.filter((c) => c.status === 'contradicted');
      const verifiedCount = r.entry.enrichment.claims.filter((c) => c.status === 'verified').length;

      if (contradicted.length > 0) {
        const disputes = contradicted
          .map((c) => `${c.claim} [DISPUTED: ${c.evidence ?? 'web sources disagree'}]`)
          .join('; ');
        enrichmentMarker = ` | ${disputes}`;
      } else if (verifiedCount > 0) {
        enrichmentMarker = ` [${String(verifiedCount)} claims VERIFIED]`;
      }
    }

    const line = `- ${category}${r.entry.title} (relevance: ${r.score.toFixed(2)}): ${content}${enrichmentMarker}`;

    if (r.entry.sessionId === currentSessionId) {
      sameSession.push(line);
    } else {
      otherSession.push(line);
    }
  }

  const sections: string[] = [];

  if (sameSession.length > 0) {
    sections.push(
      `[SAME_SESSION] Knowledge shared by this user earlier in this conversation:\n${sameSession.join('\n')}`,
    );
  }

  if (otherSession.length > 0) {
    sections.push(
      `[OTHER_SESSION] Knowledge from other sources (NOT from this user):\n${otherSession.join('\n')}`,
    );
  }

  return sections.join('\n\n');
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
        limit: 15,
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

    const contextSummary = buildContextSummary(relevantContext, state.sessionId);

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
