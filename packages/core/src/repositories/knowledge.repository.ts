import type {
  KnowledgeEntry,
  KnowledgeEntryStatus,
  KnowledgeFollowUp,
  KnowledgeSearchResult,
  KnowledgeSource,
} from '@mycel/shared/src/types/knowledge.types.js';

export interface CreateKnowledgeEntryInput {
  readonly sessionId: string;
  readonly turnId: string;
  readonly categoryId: string;
  readonly subcategoryId?: string | null;
  readonly confidence: number;
  readonly suggestedCategoryLabel: string;
  readonly topicKeywords: readonly string[];
  readonly rawInput: string;
  readonly domainSchemaId: string;
  readonly title: string;
  readonly content: string;
  readonly source: KnowledgeSource;
  readonly structuredData: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly followUp?: KnowledgeFollowUp;
  readonly embedding?: readonly number[];
  readonly embeddingModel?: string;
}

export interface UpdateKnowledgeEntryInput {
  readonly categoryId?: string;
  readonly status?: KnowledgeEntryStatus;
  readonly migratedFrom?: string;
  readonly structuredData?: Record<string, unknown>;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface KnowledgeRepository {
  create(input: CreateKnowledgeEntryInput): Promise<KnowledgeEntry>;
  getById(id: string): Promise<KnowledgeEntry | null>;
  getBySession(sessionId: string): Promise<readonly KnowledgeEntry[]>;
  getByCategory(category: string): Promise<readonly KnowledgeEntry[]>;
  getUncategorized(): Promise<readonly KnowledgeEntry[]>;
  queryByTopicKeywords(keywords: readonly string[]): Promise<readonly KnowledgeEntry[]>;
  searchSimilar(params: {
    domainSchemaId: string;
    embedding: readonly number[];
    limit?: number;
    excludeSessionId?: string;
  }): Promise<readonly KnowledgeSearchResult[]>;
  update(id: string, updates: UpdateKnowledgeEntryInput): Promise<void>;
}
