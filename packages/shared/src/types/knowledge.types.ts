export interface KnowledgeEntry {
  readonly id: string;
  readonly categoryId: string;
  readonly subcategoryId?: string;
  readonly title: string;
  readonly content: string;
  readonly source: KnowledgeSource;
  readonly structuredData: Record<string, unknown>;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly followUp?: KnowledgeFollowUp;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
