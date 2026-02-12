import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { cosineSimilarity } from '@mycel/shared/src/utils/math.js';
import type { LlmClient } from '../../llm/llm-client.js';
import { invokeAndValidate } from '../../llm/invoke-and-validate.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import type { ClusterAnalysis } from './types.js';

const log = createChildLogger('schema-evolution:pattern-detector');

const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const DEFAULT_MIN_CLUSTER_SIZE = 3;

const ClusterLabelSchema = z.object({
  categoryId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  suggestedFields: z.array(z.string()),
});

const ClusterLabelJsonSchema = zodToJsonSchema(ClusterLabelSchema, {
  name: 'ClusterLabel',
  $refStrategy: 'none',
});

export type ClusterLabel = z.infer<typeof ClusterLabelSchema>;

export interface PatternDetectorConfig {
  readonly similarityThreshold?: number;
  readonly minClusterSize?: number;
}

function greedyCluster(
  entries: readonly KnowledgeEntry[],
  threshold: number,
  minSize: number,
): readonly ClusterAnalysis[] {
  const remaining = new Set(entries.map((_, i) => i));
  const clusters: ClusterAnalysis[] = [];

  // Precompute pairwise similarities for entries with embeddings
  const withEmbeddings = entries.filter(
    (e) => e.embedding && e.embedding.length > 0,
  );

  if (withEmbeddings.length < minSize) {
    return [];
  }

  const embeddingIndices = new Map<number, number>();
  for (let i = 0; i < entries.length; i++) {
    const emb = entries[i].embedding;
    if (emb && emb.length > 0) {
      embeddingIndices.set(i, embeddingIndices.size);
    }
  }

  const similarities = new Map<string, number>();
  const indicesWithEmbeddings = [...embeddingIndices.keys()];

  for (let i = 0; i < indicesWithEmbeddings.length; i++) {
    for (let j = i + 1; j < indicesWithEmbeddings.length; j++) {
      const a = indicesWithEmbeddings[i];
      const b = indicesWithEmbeddings[j];
      const embA = entries[a].embedding;
      const embB = entries[b].embedding;
      if (!embA || !embB) continue;
      const sim = cosineSimilarity(embA, embB);
      similarities.set(`${String(a)}-${String(b)}`, sim);
      similarities.set(`${String(b)}-${String(a)}`, sim);
    }
  }

  while (remaining.size >= minSize) {
    // Pick first remaining entry with embedding as centroid
    let centroidIdx = -1;
    for (const idx of remaining) {
      if (embeddingIndices.has(idx)) {
        centroidIdx = idx;
        break;
      }
    }
    if (centroidIdx === -1) break;

    // Find all entries similar to centroid
    const clusterIndices = [centroidIdx];
    for (const idx of remaining) {
      if (idx === centroidIdx) continue;
      if (!embeddingIndices.has(idx)) continue;
      const sim = similarities.get(`${String(centroidIdx)}-${String(idx)}`) ?? 0;
      if (sim >= threshold) {
        clusterIndices.push(idx);
      }
    }

    if (clusterIndices.length < minSize) {
      remaining.delete(centroidIdx);
      continue;
    }

    // Compute average similarity
    let totalSim = 0;
    let pairCount = 0;
    for (let i = 0; i < clusterIndices.length; i++) {
      for (let j = i + 1; j < clusterIndices.length; j++) {
        totalSim += similarities.get(
          `${String(clusterIndices[i])}-${String(clusterIndices[j])}`,
        ) ?? 0;
        pairCount++;
      }
    }
    const averageSimilarity = pairCount > 0 ? totalSim / pairCount : 0;

    // Collect top keywords from tags
    const keywordCounts = new Map<string, number>();
    for (const idx of clusterIndices) {
      const entry = entries[idx];
      for (const tag of entry.tags) {
        keywordCounts.set(tag, (keywordCounts.get(tag) ?? 0) + 1);
      }
      for (const kw of entry.topicKeywords ?? []) {
        keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
      }
    }
    const topKeywords = [...keywordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kw]) => kw);

    clusters.push({
      entries: clusterIndices.map((i) => entries[i]),
      centroidEntryId: entries[centroidIdx].id,
      averageSimilarity,
      topKeywords,
    });

    for (const idx of clusterIndices) {
      remaining.delete(idx);
    }
  }

  return clusters;
}

function overlapsExistingCategory(
  topKeywords: readonly string[],
  domainConfig: DomainConfig,
): boolean {
  const MIN_TERM_LENGTH = 3;
  for (const category of domainConfig.categories) {
    const categoryTerms = [
      category.id.toLowerCase(),
      category.label.toLowerCase(),
      ...category.description.toLowerCase().split(/\s+/),
    ].filter((t) => t.length >= MIN_TERM_LENGTH);
    const overlap = topKeywords.filter((kw) => {
      if (kw.length < MIN_TERM_LENGTH) return false;
      const kwLower = kw.toLowerCase();
      return categoryTerms.some((t) => t === kwLower || t.includes(kwLower) || kwLower.includes(t));
    });
    if (overlap.length >= 2) {
      return true;
    }
  }
  return false;
}

export async function detectPatterns(
  entries: readonly KnowledgeEntry[],
  domainConfig: DomainConfig,
  llmClient: LlmClient,
  config?: PatternDetectorConfig,
): Promise<readonly { cluster: ClusterAnalysis; label: ClusterLabel }[]> {
  const threshold = config?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const minSize = config?.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;

  log.info(
    { entryCount: entries.length, threshold, minSize },
    'Detecting patterns in uncategorized entries',
  );

  const clusters = greedyCluster(entries, threshold, minSize);

  log.info({ clusterCount: clusters.length }, 'Clusters found');

  const results: { cluster: ClusterAnalysis; label: ClusterLabel }[] = [];

  for (const cluster of clusters) {
    if (overlapsExistingCategory(cluster.topKeywords, domainConfig)) {
      log.info(
        { topKeywords: cluster.topKeywords },
        'Skipping cluster that overlaps with existing category',
      );
      continue;
    }

    const entrySummaries = cluster.entries
      .slice(0, 5)
      .map((e) => `- ${e.title}: ${e.content.slice(0, 100)}`)
      .join('\n');

    const label = await invokeAndValidate({
      llmClient,
      request: {
        systemPrompt: `You are analyzing a cluster of related knowledge entries that don't fit any existing category.
Suggest a new category for these entries.

Existing categories: ${domainConfig.categories.map((c) => c.label).join(', ')}

Rules:
- The category ID should be lowercase, kebab-case (e.g. "local-traditions")
- The label should be human-readable
- The description should explain what knowledge belongs in this category
- Suggest 2-4 fields that would be useful for entries in this category
- Respond in the same language as the entries

Respond with a JSON object with: categoryId, label, description, suggestedFields`,
        userMessage: `Cluster keywords: ${cluster.topKeywords.join(', ')}

Sample entries:
${entrySummaries}`,
        jsonSchema: ClusterLabelJsonSchema as Record<string, unknown>,
      },
      schema: ClusterLabelSchema,
      agentName: 'Pattern detector',
    });

    results.push({ cluster, label });
  }

  log.info({ resultCount: results.length }, 'Pattern detection complete');

  return results;
}
