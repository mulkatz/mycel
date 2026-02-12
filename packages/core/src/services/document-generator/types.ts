import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { KnowledgeRepository } from '../../repositories/knowledge.repository.js';
import type { SchemaRepository } from '../../repositories/schema.repository.js';
import type { TextLlmClient } from '../../llm/text-llm-client.js';
import type { FirestoreBase } from '../../infrastructure/firestore-types.js';

export interface DocumentGeneratorDeps {
  readonly knowledgeRepository: KnowledgeRepository;
  readonly schemaRepository: SchemaRepository;
  readonly textLlmClient: TextLlmClient;
  readonly firestoreBase: FirestoreBase;
}

export interface GenerateDocumentParams {
  readonly domainSchemaId: string;
}

export interface ChapterPlan {
  readonly chapterNumber: number;
  readonly categoryId: string;
  readonly title: string;
  readonly filename: string;
  readonly entries: readonly KnowledgeEntry[];
}

export interface GapHint {
  readonly field: string;
  readonly description: string;
}

export interface ChapterResult {
  readonly filename: string;
  readonly title: string;
  readonly content: string;
  readonly entryCount: number;
  readonly gapCount: number;
  readonly gaps: readonly GapHint[];
}

export interface DocumentMeta {
  readonly generatedAt: string;
  readonly domainSchemaId: string;
  readonly contentLanguage: string;
  readonly totalEntries: number;
  readonly totalChapters: number;
  readonly chaptersWithContent: number;
  readonly chaptersEmpty: number;
  readonly gapsIdentified: number;
  readonly sourceEntryIds: readonly string[];
  readonly generationDurationMs: number;
}

export interface GeneratedDocument {
  readonly meta: DocumentMeta;
  readonly chapters: readonly ChapterResult[];
  readonly indexContent: string;
}

export interface DocumentGenerator {
  generate(params: GenerateDocumentParams): Promise<GeneratedDocument>;
  getLatest(domainSchemaId: string): Promise<GeneratedDocument | null>;
}
