import type { KnowledgeEnrichment } from './enrichment.types.js';

export type KnowledgeEntryStatus = 'draft' | 'confirmed' | 'migrated';

export interface KnowledgeEntry {
  readonly id: string;
  readonly categoryId: string;
  readonly subcategoryId?: string | null;
  readonly title: string;
  readonly content: string;
  readonly source: KnowledgeSource;
  readonly structuredData: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly followUp?: KnowledgeFollowUp;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Persistence fields (ADR-004: Adaptive Schema Evolution)
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly confidence?: number;
  readonly suggestedCategoryLabel?: string;
  readonly topicKeywords?: readonly string[];
  readonly rawInput?: string;
  readonly status?: KnowledgeEntryStatus;
  readonly migratedFrom?: string;
  readonly migratedAt?: Date;
  readonly domainSchemaId?: string;

  // Embedding fields (RAG foundation)
  readonly embedding?: readonly number[];
  readonly embeddingModel?: string;
  readonly embeddingGeneratedAt?: Date;

  // Enrichment data (web search verification)
  readonly enrichment?: KnowledgeEnrichment;
}

export interface KnowledgeFollowUp {
  readonly gaps: readonly string[];
  readonly suggestedQuestions: readonly string[];
}

export interface KnowledgeSource {
  readonly type: 'audio' | 'image' | 'text';
  readonly originalUri?: string;
  readonly processingDetails?: ProcessingDetails;
}

export interface ProcessingDetails {
  readonly transcription?: string;
  readonly extractedText?: string;
  readonly confidence?: number;
}

export interface KnowledgeQuery {
  readonly query: string;
  readonly categoryIds?: readonly string[];
  readonly limit?: number;
}

export interface KnowledgeSearchResult {
  readonly entry: KnowledgeEntry;
  readonly score: number;
}
