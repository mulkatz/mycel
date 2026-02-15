import { Timestamp } from '@google-cloud/firestore';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  DocumentGeneratorDeps,
  GenerateDocumentParams,
  GeneratedDocument,
  DocumentGenerator,
  ChapterResult,
  DocumentMeta,
} from './types.js';
import { collectEntries } from './entry-collector.js';
import { planChapters } from './chapter-planner.js';
import { writeChapter } from './chapter-writer.js';
import { analyzeGaps, formatGapHints } from './gap-analyzer.js';
import { generateIndex } from './index-generator.js';

const log = createChildLogger('document-generator');

const COLLECTION = 'generated-documents';

interface PersistedChapterMeta {
  readonly title: string;
  readonly entryCount: number;
  readonly gapCount: number;
}

// TODO: Phase 2 — check behavior.documentGeneration for on_session_end/threshold

export function createDocumentGenerator(deps: DocumentGeneratorDeps): DocumentGenerator {
  const { knowledgeRepository, schemaRepository, textLlmClient, firestoreBase } = deps;

  return {
    async generate(params: GenerateDocumentParams): Promise<GeneratedDocument> {
      const startTime = Date.now();

      log.info({ domainSchemaId: params.domainSchemaId }, 'Starting document generation');

      // 1. Load domain schema
      const domainSchema = await schemaRepository.getDomainSchema(params.domainSchemaId);
      if (!domainSchema) {
        throw new PersistenceError(`Domain schema not found: ${params.domainSchemaId}`);
      }
      const domainConfig = domainSchema.config;

      // 2. Collect entries
      const groupedEntries = await collectEntries(knowledgeRepository, params.domainSchemaId);

      // 3. Plan chapters
      const chapterPlans = planChapters(domainConfig, groupedEntries);

      // 4. Write chapters sequentially (avoid LLM rate limits)
      const chapterResults: ChapterResult[] = [];

      for (const plan of chapterPlans) {
        const category = domainConfig.categories.find((c) => c.id === plan.categoryId);

        // Write chapter content
        const content = await writeChapter(plan, domainConfig, textLlmClient);

        // Analyze gaps
        const gaps = analyzeGaps(plan.entries, category);
        const gapSuffix = formatGapHints(gaps);

        chapterResults.push({
          filename: plan.filename,
          title: plan.title,
          content: content + gapSuffix,
          entryCount: plan.entries.length,
          gapCount: gaps.length,
          gaps,
        });
      }

      // 5. Build meta
      const allEntryIds: string[] = [];
      for (const entries of groupedEntries.values()) {
        for (const entry of entries) {
          allEntryIds.push(entry.id);
        }
      }

      const chaptersWithContent = chapterResults.filter((c) => c.entryCount > 0).length;
      const chaptersEmpty = chapterResults.filter((c) => c.entryCount === 0).length;
      const totalGaps = chapterResults.reduce((sum, c) => sum + c.gapCount, 0);
      const generationDurationMs = Date.now() - startTime;

      const meta: DocumentMeta = {
        generatedAt: new Date().toISOString(),
        domainSchemaId: params.domainSchemaId,
        contentLanguage: domainConfig.ingestion.primaryLanguage,
        totalEntries: allEntryIds.length,
        totalChapters: chapterResults.length,
        chaptersWithContent,
        chaptersEmpty,
        gapsIdentified: totalGaps,
        sourceEntryIds: allEntryIds,
        generationDurationMs,
      };

      // 6. Generate index
      const indexContent = generateIndex(domainConfig, chapterResults, meta);

      // 7. Save to Firestore
      const chaptersMap: Record<string, string> = {};
      const chapterMetaMap: Record<string, PersistedChapterMeta> = {};
      for (const chapter of chapterResults) {
        chaptersMap[chapter.filename] = chapter.content;
        chapterMetaMap[chapter.filename] = {
          title: chapter.title,
          entryCount: chapter.entryCount,
          gapCount: chapter.gapCount,
        };
      }

      const docRef = firestoreBase.collection(COLLECTION).doc(params.domainSchemaId);
      await docRef.set({
        generatedAt: Timestamp.now(),
        meta,
        chapters: chaptersMap,
        chapterMeta: chapterMetaMap,
        indexContent,
      });

      log.info(
        {
          domainSchemaId: params.domainSchemaId,
          totalEntries: allEntryIds.length,
          totalChapters: chapterResults.length,
          gapsIdentified: totalGaps,
          durationMs: generationDurationMs,
        },
        'Document generation completed',
      );

      return { meta, chapters: chapterResults, indexContent };
    },

    async getLatest(domainSchemaId: string): Promise<GeneratedDocument | null> {
      const docRef = firestoreBase.collection(COLLECTION).doc(domainSchemaId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as {
        meta: DocumentMeta;
        chapters: Record<string, string>;
        chapterMeta?: Record<string, PersistedChapterMeta>;
        indexContent: string;
      };

      const chapterResults: ChapterResult[] = Object.entries(data.chapters).map(
        ([filename, content]) => {
          const savedMeta = data.chapterMeta?.[filename];
          return {
            filename,
            title: savedMeta?.title ?? filename.replace(/^\d+-/, '').replace(/\.md$/, ''),
            content,
            entryCount: savedMeta?.entryCount ?? 0,
            gapCount: savedMeta?.gapCount ?? 0,
            gaps: [],
          };
        },
      );

      // Sort by filename to maintain chapter order
      chapterResults.sort((a, b) => a.filename.localeCompare(b.filename));

      return {
        meta: data.meta,
        chapters: chapterResults,
        indexContent: data.indexContent,
      };
    },
  };
}
