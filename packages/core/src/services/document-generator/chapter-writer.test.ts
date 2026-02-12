import { describe, it, expect, vi } from 'vitest';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { TextLlmClient } from '../../llm/text-llm-client.js';
import type { ChapterPlan } from './types.js';
import { writeChapter } from './chapter-writer.js';

const domainConfig: DomainConfig = {
  name: 'test-domain',
  version: '1.0.0',
  description: 'Knowledge base for a test community',
  categories: [
    { id: 'history', label: 'History & Heritage', description: 'Historical events' },
  ],
  ingestion: {
    allowedModalities: ['text'],
    primaryLanguage: 'de',
    supportedLanguages: ['de'],
  },
};

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'entry-1',
    categoryId: 'history',
    title: 'Old Church',
    content: 'The church was built in 1732.',
    source: { type: 'text' },
    structuredData: { period: '18th century' },
    tags: ['history', 'architecture'],
    metadata: {},
    confidence: 0.85,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('writeChapter', () => {
  it('should return stub for empty chapter', async () => {
    const mockLlm: TextLlmClient = { invoke: vi.fn() };
    const plan: ChapterPlan = {
      chapterNumber: 1,
      categoryId: 'history',
      title: 'History & Heritage',
      filename: '01-history.md',
      entries: [],
    };

    const result = await writeChapter(plan, domainConfig, mockLlm);

    expect(result).toContain('# History & Heritage');
    expect(result).toContain('No information has been collected yet');
    expect(mockLlm.invoke).not.toHaveBeenCalled();
  });

  it('should call LLM for chapter with entries', async () => {
    const mockLlm: TextLlmClient = {
      invoke: vi.fn().mockResolvedValue({
        content: '# History & Heritage\n\nThe old church stands proudly since 1732.\n',
      }),
    };
    const plan: ChapterPlan = {
      chapterNumber: 1,
      categoryId: 'history',
      title: 'History & Heritage',
      filename: '01-history.md',
      entries: [makeEntry()],
    };

    const result = await writeChapter(plan, domainConfig, mockLlm);

    expect(result).toContain('History & Heritage');
    expect(result).toContain('1732');
    expect(mockLlm.invoke).toHaveBeenCalledOnce();
  });

  it('should include entry data in LLM prompt', async () => {
    const mockLlm: TextLlmClient = {
      invoke: vi.fn().mockResolvedValue({ content: '# Chapter\n\nContent.\n' }),
    };
    const plan: ChapterPlan = {
      chapterNumber: 1,
      categoryId: 'history',
      title: 'History & Heritage',
      filename: '01-history.md',
      entries: [
        makeEntry({ title: 'Old Church', content: 'Built in 1732' }),
        makeEntry({ id: 'entry-2', title: 'Town Hall', content: 'Built in 1850' }),
      ],
    };

    await writeChapter(plan, domainConfig, mockLlm);

    const call = vi.mocked(mockLlm.invoke).mock.calls[0][0];
    expect(call.userMessage).toContain('Old Church');
    expect(call.userMessage).toContain('Town Hall');
    expect(call.userMessage).toContain('Built in 1732');
    expect(call.userMessage).toContain('Built in 1850');
    expect(call.systemPrompt).toContain('NEVER invent');
  });
});
