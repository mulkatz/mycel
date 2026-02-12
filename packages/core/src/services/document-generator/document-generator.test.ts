import { describe, it, expect, vi } from 'vitest';
import type { Firestore } from '@google-cloud/firestore';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { createInMemoryKnowledgeRepository } from '../../repositories/in-memory-knowledge.repository.js';
import { createInMemorySchemaRepository } from '../../repositories/in-memory-schema.repository.js';
import type { TextLlmClient } from '../../llm/text-llm-client.js';
import type { CreateKnowledgeEntryInput } from '../../repositories/knowledge.repository.js';
import { createDocumentGenerator } from './document-generator.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Knowledge base for testing',
  categories: [
    {
      id: 'history',
      label: 'History & Heritage',
      description: 'Historical events',
      requiredFields: ['period', 'sources'],
    },
    {
      id: 'nature',
      label: 'Nature & Environment',
      description: 'Nature things',
    },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

function makeEntryInput(overrides: Partial<CreateKnowledgeEntryInput> = {}): CreateKnowledgeEntryInput {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    categoryId: 'history',
    confidence: 0.9,
    topicKeywords: ['test'],
    rawInput: 'test input',
    domainSchemaId: 'test-domain',
    title: 'Old Church',
    content: 'The church was built in 1732.',
    source: { type: 'text' },
    structuredData: { period: '18th century' },
    tags: ['history'],
    metadata: {},
    ...overrides,
  };
}

function createMockFirestore(): Firestore {
  const store = new Map<string, Record<string, unknown>>();

  const mockDoc = (path: string) => ({
    set: vi.fn(async (data: Record<string, unknown>) => {
      store.set(path, data);
    }),
    get: vi.fn(async () => {
      const data = store.get(path);
      return {
        exists: !!data,
        data: () => data,
      };
    }),
  });

  return {
    collection: vi.fn((collectionName: string) => ({
      doc: vi.fn((docId: string) => mockDoc(`${collectionName}/${docId}`)),
    })),
  } as unknown as Firestore;
}

describe('createDocumentGenerator', () => {
  it('should generate a document with chapters and index', async () => {
    const knowledgeRepo = createInMemoryKnowledgeRepository();
    const schemaRepo = createInMemorySchemaRepository();

    await schemaRepo.saveDomainSchema({
      name: 'test-domain',
      version: 1,
      config: domainConfig,
      isActive: true,
    });

    await knowledgeRepo.create(makeEntryInput({
      categoryId: 'history',
      title: 'Old Church',
      content: 'Built in 1732.',
      structuredData: { period: '18th century' },
    }));
    await knowledgeRepo.create(makeEntryInput({
      categoryId: 'nature',
      title: 'The Lake',
      content: 'A beautiful lake.',
      structuredData: {},
    }));

    const mockTextLlm: TextLlmClient = {
      invoke: vi.fn().mockImplementation(async (req: { userMessage: string }) => {
        if (req.userMessage.includes('History')) {
          return { content: '# History & Heritage\n\nThe old church was built in 1732.\n' };
        }
        return { content: '# Nature & Environment\n\nA beautiful lake lies nearby.\n' };
      }),
    };

    const generator = createDocumentGenerator({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      textLlmClient: mockTextLlm,
      firestoreBase: createMockFirestore(),
    });

    const result = await generator.generate({ domainSchemaId: 'test-domain' });

    // Check meta
    expect(result.meta.domainSchemaId).toBe('test-domain');
    expect(result.meta.totalEntries).toBe(2);
    expect(result.meta.totalChapters).toBe(2);
    expect(result.meta.chaptersWithContent).toBe(2);
    expect(result.meta.chaptersEmpty).toBe(0);
    expect(result.meta.contentLanguage).toBe('de');

    // Check chapters
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].filename).toBe('01-history.md');
    expect(result.chapters[0].entryCount).toBe(1);
    expect(result.chapters[0].content).toContain('1732');
    expect(result.chapters[1].filename).toBe('02-nature.md');
    expect(result.chapters[1].entryCount).toBe(1);

    // Check index
    expect(result.indexContent).toContain('test-domain');
    expect(result.indexContent).toContain('01-history.md');
    expect(result.indexContent).toContain('02-nature.md');

    // LLM should have been called twice (once per chapter with content)
    expect(mockTextLlm.invoke).toHaveBeenCalledTimes(2);
  });

  it('should handle empty domain with no entries', async () => {
    const knowledgeRepo = createInMemoryKnowledgeRepository();
    const schemaRepo = createInMemorySchemaRepository();

    await schemaRepo.saveDomainSchema({
      name: 'empty-domain',
      version: 1,
      config: domainConfig,
      isActive: true,
    });

    const mockTextLlm: TextLlmClient = { invoke: vi.fn() };

    const generator = createDocumentGenerator({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      textLlmClient: mockTextLlm,
      firestoreBase: createMockFirestore(),
    });

    const result = await generator.generate({ domainSchemaId: 'empty-domain' });

    expect(result.meta.totalEntries).toBe(0);
    expect(result.meta.chaptersEmpty).toBe(2);
    expect(result.chapters).toHaveLength(2);
    for (const chapter of result.chapters) {
      expect(chapter.content).toContain('No information has been collected yet');
    }
    // LLM should not have been called
    expect(mockTextLlm.invoke).not.toHaveBeenCalled();
  });

  it('should include gap hints for chapters with missing fields', async () => {
    const knowledgeRepo = createInMemoryKnowledgeRepository();
    const schemaRepo = createInMemorySchemaRepository();

    await schemaRepo.saveDomainSchema({
      name: 'test-domain',
      version: 1,
      config: domainConfig,
      isActive: true,
    });

    // Entry missing 'sources' required field
    await knowledgeRepo.create(makeEntryInput({
      structuredData: { period: '18th century' },
    }));

    const mockTextLlm: TextLlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: '# History & Heritage\n\nSome content.\n',
      }),
    };

    const generator = createDocumentGenerator({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      textLlmClient: mockTextLlm,
      firestoreBase: createMockFirestore(),
    });

    const result = await generator.generate({ domainSchemaId: 'test-domain' });

    const historyChapter = result.chapters.find((c) => c.filename === '01-history.md');
    expect(historyChapter?.gapCount).toBeGreaterThan(0);
    expect(historyChapter?.content).toContain("What's still missing");
    expect(historyChapter?.content).toContain('sources');
  });

  it('should preserve chapter metadata through getLatest round-trip', async () => {
    const knowledgeRepo = createInMemoryKnowledgeRepository();
    const schemaRepo = createInMemorySchemaRepository();

    await schemaRepo.saveDomainSchema({
      name: 'test-domain',
      version: 1,
      config: domainConfig,
      isActive: true,
    });

    await knowledgeRepo.create(makeEntryInput({
      categoryId: 'history',
      title: 'Old Church',
      structuredData: { period: '18th century' },
    }));

    const mockTextLlm: TextLlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: '# History & Heritage\n\nThe old church.\n',
      }),
    };

    const mockFirestore = createMockFirestore();
    const generator = createDocumentGenerator({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      textLlmClient: mockTextLlm,
      firestoreBase: mockFirestore,
    });

    await generator.generate({ domainSchemaId: 'test-domain' });
    const retrieved = await generator.getLatest('test-domain');

    expect(retrieved).not.toBeNull();
    const historyChapter = retrieved!.chapters.find((c) => c.filename === '01-history.md');
    expect(historyChapter?.title).toBe('History & Heritage');
    expect(historyChapter?.entryCount).toBe(1);
    expect(historyChapter?.gapCount).toBeGreaterThan(0);
  });

  it('should throw when domain schema not found', async () => {
    const knowledgeRepo = createInMemoryKnowledgeRepository();
    const schemaRepo = createInMemorySchemaRepository();
    const mockTextLlm: TextLlmClient = { invoke: vi.fn() };

    const generator = createDocumentGenerator({
      knowledgeRepository: knowledgeRepo,
      schemaRepository: schemaRepo,
      textLlmClient: mockTextLlm,
      firestoreBase: createMockFirestore(),
    });

    await expect(generator.generate({ domainSchemaId: 'nonexistent' }))
      .rejects.toThrow('Domain schema not found');
  });
});
