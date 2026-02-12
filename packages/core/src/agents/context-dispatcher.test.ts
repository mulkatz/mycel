import { describe, it, expect, vi } from 'vitest';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import { createContextDispatcherNode } from './context-dispatcher.js';
import type { EmbeddingClient } from '../embedding/embedding-client.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.js';
import { EMBEDDING_DIMENSION } from '../embedding/embedding-client.js';

function createMockState(overrides: Partial<PipelineGraphState> = {}): PipelineGraphState {
  return {
    sessionId: 'test-session',
    input: { sessionId: 'test-session', content: 'test content', metadata: {} },
    classifierOutput: {
      agentRole: 'classifier',
      result: { categoryId: 'history', confidence: 0.9 },
      confidence: 0.9,
    },
    contextDispatcherOutput: undefined,
    gapReasoningOutput: undefined,
    personaOutput: undefined,
    structuringOutput: undefined,
    turnContext: undefined,
    activeCategory: undefined,
    ...overrides,
  };
}

function createMockEmbedding(): number[] {
  return new Array<number>(EMBEDDING_DIMENSION).fill(0.1);
}

describe('createContextDispatcherNode', () => {
  it('should return empty context when no deps provided', async () => {
    const node = createContextDispatcherNode();
    const result = await node(createMockState());

    expect(result.contextDispatcherOutput).toBeDefined();
    expect(result.contextDispatcherOutput?.agentRole).toBe('context-dispatcher');
    expect(result.contextDispatcherOutput?.result.relevantContext).toEqual([]);
    expect(result.contextDispatcherOutput?.result.contextSummary).toContain('not configured');
  });

  it('should have confidence of 1.0', async () => {
    const node = createContextDispatcherNode();
    const result = await node(createMockState());

    expect(result.contextDispatcherOutput?.confidence).toBe(1.0);
  });

  it('should return empty context when embedding client not provided', async () => {
    const node = createContextDispatcherNode({
      domainSchemaId: 'test-domain',
    });
    const result = await node(createMockState());

    expect(result.contextDispatcherOutput?.result.relevantContext).toEqual([]);
  });

  it('should perform vector search when deps are provided', async () => {
    const generateEmbeddingFn = vi.fn().mockResolvedValue(createMockEmbedding());
    const mockEmbeddingClient: EmbeddingClient = {
      generateEmbedding: generateEmbeddingFn,
      generateEmbeddings: vi.fn(),
    };

    const mockEntry = {
      id: 'entry-1',
      sessionId: 'other-session',
      categoryId: 'history',
      title: 'Old Church',
      content: 'The old church was built in 1732.',
      source: { type: 'text' as const },
      structuredData: {},
      tags: ['history'],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const searchSimilarFn = vi.fn().mockResolvedValue([{ entry: mockEntry, score: 0.85 }]);
    const mockKnowledgeRepo = {
      searchSimilar: searchSimilarFn,
    } as unknown as KnowledgeRepository;

    const node = createContextDispatcherNode({
      embeddingClient: mockEmbeddingClient,
      knowledgeRepository: mockKnowledgeRepo,
      domainSchemaId: 'test-domain',
    });

    const result = await node(createMockState());

    expect(generateEmbeddingFn).toHaveBeenCalled();
    expect(searchSimilarFn).toHaveBeenCalledWith({
      domainSchemaId: 'test-domain',
      embedding: createMockEmbedding(),
      limit: 5,
    });

    expect(result.contextDispatcherOutput?.result.relevantContext).toHaveLength(1);
    expect(result.contextDispatcherOutput?.result.contextSummary).toContain('Old Church');
    expect(result.contextDispatcherOutput?.result.contextSummary).toContain('0.85');
    expect(result.contextDispatcherOutput?.result.contextSummary).toContain('[OTHER_SESSION]');
  });

  it('should tag same-session results as SAME_SESSION', async () => {
    const mockEmbeddingClient: EmbeddingClient = {
      generateEmbedding: vi.fn().mockResolvedValue(createMockEmbedding()),
      generateEmbeddings: vi.fn(),
    };

    const sameSessionEntry = {
      id: 'entry-same',
      sessionId: 'test-session',
      categoryId: 'history',
      title: 'Village Square',
      content: 'The village square has a fountain.',
      source: { type: 'text' as const },
      structuredData: {},
      tags: ['history'],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const otherSessionEntry = {
      id: 'entry-other',
      sessionId: 'other-session',
      categoryId: 'history',
      title: 'Old Church',
      content: 'The old church was built in 1732.',
      source: { type: 'text' as const },
      structuredData: {},
      tags: ['history'],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockKnowledgeRepo = {
      searchSimilar: vi.fn().mockResolvedValue([
        { entry: sameSessionEntry, score: 0.9 },
        { entry: otherSessionEntry, score: 0.8 },
      ]),
    } as unknown as KnowledgeRepository;

    const node = createContextDispatcherNode({
      embeddingClient: mockEmbeddingClient,
      knowledgeRepository: mockKnowledgeRepo,
      domainSchemaId: 'test-domain',
    });

    const result = await node(createMockState());
    const summary = result.contextDispatcherOutput?.result.contextSummary ?? '';

    expect(summary).toContain('[SAME_SESSION]');
    expect(summary).toContain('[OTHER_SESSION]');
    expect(summary).toContain('Village Square');
    expect(summary).toContain('Old Church');
  });

  it('should gracefully handle embedding failure', async () => {
    const mockEmbeddingClient: EmbeddingClient = {
      generateEmbedding: vi.fn().mockRejectedValue(new Error('Vertex AI unavailable')),
      generateEmbeddings: vi.fn(),
    };

    const mockKnowledgeRepo = {
      searchSimilar: vi.fn(),
    } as unknown as KnowledgeRepository;

    const node = createContextDispatcherNode({
      embeddingClient: mockEmbeddingClient,
      knowledgeRepository: mockKnowledgeRepo,
      domainSchemaId: 'test-domain',
    });

    const result = await node(createMockState());

    expect(result.contextDispatcherOutput?.result.relevantContext).toEqual([]);
    expect(result.contextDispatcherOutput?.result.contextSummary).toContain('No related knowledge found');
  });

  it('should gracefully handle search failure', async () => {
    const mockEmbeddingClient: EmbeddingClient = {
      generateEmbedding: vi.fn().mockResolvedValue(createMockEmbedding()),
      generateEmbeddings: vi.fn(),
    };

    const mockKnowledgeRepo = {
      searchSimilar: vi.fn().mockRejectedValue(new Error('Firestore error')),
    } as unknown as KnowledgeRepository;

    const node = createContextDispatcherNode({
      embeddingClient: mockEmbeddingClient,
      knowledgeRepository: mockKnowledgeRepo,
      domainSchemaId: 'test-domain',
    });

    const result = await node(createMockState());

    expect(result.contextDispatcherOutput?.result.relevantContext).toEqual([]);
  });
});
