import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { TextLlmClient } from '../../llm/text-llm-client.js';
import type { ChapterPlan } from './types.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('document-generator:chapter-writer');

function buildEntryBlock(plan: ChapterPlan): string {
  return plan.entries
    .map((entry, i) => {
      const lines = [`### Entry ${String(i + 1)}: ${entry.title}`];
      lines.push(`- Content: ${entry.content}`);

      const structuredKeys = Object.keys(entry.structuredData);
      if (structuredKeys.length > 0) {
        lines.push(`- Structured data: ${JSON.stringify(entry.structuredData)}`);
      }

      if (entry.tags.length > 0) {
        lines.push(`- Tags: ${entry.tags.join(', ')}`);
      }

      if (entry.confidence !== undefined) {
        lines.push(`- Confidence: ${String(Math.round(entry.confidence * 100))}%`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

export async function writeChapter(
  plan: ChapterPlan,
  domainConfig: DomainConfig,
  textLlmClient: TextLlmClient,
): Promise<string> {
  if (plan.entries.length === 0) {
    log.info({ categoryId: plan.categoryId }, 'No entries for chapter, returning stub');
    return `# ${plan.title}\n\nNo information has been collected yet for this topic.\n`;
  }

  const systemPrompt = `You are an author writing a local knowledge book about "${domainConfig.description}".
Write vivid, fact-based prose based on the collected information.
NEVER invent anything that is not in the provided knowledge entries.
If little information is available, keep it brief — do not pad with filler.
Write in the same language as the provided knowledge entries.
Output Markdown starting with a level-1 heading (# ${plan.title}).
Use subheadings (##, ###) to organize content if there are multiple topics.
Weave the information into flowing, readable prose — do not just list facts.`;

  const entryBlock = buildEntryBlock(plan);

  const userMessage = `Write the chapter "${plan.title}" based on the following ${String(plan.entries.length)} collected knowledge entries:

${entryBlock}

Style: Local knowledge book — warm, factual, readable.
Weave the information into flowing prose. Do not just repeat the entries as bullet points.
Output language: match the language of the knowledge entries above.`;

  log.info(
    { categoryId: plan.categoryId, entryCount: plan.entries.length },
    'Generating chapter content via LLM',
  );

  const response = await textLlmClient.invoke({ systemPrompt, userMessage });

  return response.content;
}
