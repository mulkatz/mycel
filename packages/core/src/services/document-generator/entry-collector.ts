import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { KnowledgeRepository } from '../../repositories/knowledge.repository.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('document-generator:entry-collector');

export async function collectEntries(
  knowledgeRepository: KnowledgeRepository,
  domainSchemaId: string,
): Promise<Map<string, KnowledgeEntry[]>> {
  const allEntries = await knowledgeRepository.getByDomain(domainSchemaId);

  log.info(
    { domainSchemaId, entryCount: allEntries.length },
    'Collected entries for domain',
  );

  const grouped = new Map<string, KnowledgeEntry[]>();

  for (const entry of allEntries) {
    const categoryId = entry.categoryId;
    const existing = grouped.get(categoryId);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(categoryId, [entry]);
    }
  }

  // Sort each group by createdAt ascending (entries from getByDomain are already sorted,
  // but ensure consistency)
  for (const entries of grouped.values()) {
    entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  log.info(
    { categories: grouped.size },
    'Grouped entries by category',
  );

  return grouped;
}
