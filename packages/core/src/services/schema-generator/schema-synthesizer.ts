import { z } from 'zod';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { DomainSchema } from '@mycel/schemas/src/domain.schema.js';
import type { LlmClient } from '../../llm/llm-client.js';
import { invokeAndValidate } from '../../llm/invoke-and-validate.js';
import type { DomainAnalysis } from './types.js';
import type { WebSearchResult } from '../web-search/types.js';

const log = createChildLogger('schema-generator:schema-synthesizer');

const SynthesizedSchemaSchema = DomainSchema.extend({
  categories: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      description: z.string(),
      requiredFields: z.array(z.string()).optional(),
      optionalFields: z.array(z.string()).optional(),
      origin: z.enum(['seed', 'discovered', 'web_research']).optional(),
      sourceUrls: z.array(z.string()).optional(),
    }),
  ).min(1),
});

function buildSystemPrompt(partialSchema?: Partial<DomainConfig>): string {
  const base = `You are an expert knowledge engineer. Based on the domain analysis and web research results provided, create a comprehensive domain schema for a knowledge management system.

The schema must include:
1. A machine-readable "name" (lowercase, hyphens only, e.g., "village-naugarten")
2. Version "1.0.0"
3. A human-readable description
4. 3-8 categories that cover the main areas of knowledge for this domain
5. Ingestion config with language settings
6. Optional completeness config

For each category:
- Use a short, lowercase, hyphenated "id" (e.g., "local-history")
- Provide a clear "label" and "description"
- List "requiredFields" (essential structured data for this category)
- List "optionalFields" (nice-to-have structured data)
- Set "origin" to "web_research" for categories derived from research
- Include "sourceUrls" with URLs that informed this category

Categories should be:
- Mutually exclusive (no overlap)
- Collectively exhaustive (cover the domain well)
- Practical (3-8 categories, not too granular)

Respond with valid JSON matching the DomainConfig schema.`;

  if (partialSchema?.categories && partialSchema.categories.length > 0) {
    const existingCategories = JSON.stringify(partialSchema.categories, null, 2);
    return `${base}

IMPORTANT - Hybrid Mode:
The user has already defined some categories. You MUST keep all existing categories exactly as they are (same id, label, description, fields). You may add NEW categories based on the research, but never modify or remove existing ones.

Existing categories to preserve:
${existingCategories}`;
  }

  return base;
}

function buildUserMessage(
  analysis: DomainAnalysis,
  searchResults: readonly WebSearchResult[],
  partialSchema?: Partial<DomainConfig>,
): string {
  const researchSection = searchResults
    .map((r) => `### Research: "${r.query}"\n${r.content}\nSources: ${r.sourceUrls.join(', ')}`)
    .join('\n\n');

  let message = `## Domain Analysis
- Type: ${analysis.domainType}
- Subject: ${analysis.subject}
- Location: ${analysis.location ?? 'not specified'}
- Language: ${analysis.language}
- Intent: ${analysis.intent}

## Web Research Results
${researchSection}`;

  if (partialSchema) {
    const partial = JSON.stringify(partialSchema, null, 2);
    message += `\n\n## Existing Partial Schema\n${partial}`;
  }

  return message;
}

export async function synthesizeSchema(
  analysis: DomainAnalysis,
  searchResults: readonly WebSearchResult[],
  llmClient: LlmClient,
  partialSchema?: Partial<DomainConfig>,
): Promise<DomainConfig> {
  log.info(
    { subject: analysis.subject, searchResultCount: searchResults.length },
    'Synthesizing domain schema',
  );

  const result = await invokeAndValidate({
    llmClient,
    request: {
      systemPrompt: buildSystemPrompt(partialSchema),
      userMessage: buildUserMessage(analysis, searchResults, partialSchema),
    },
    schema: SynthesizedSchemaSchema,
    agentName: 'SchemaSynthesizer',
  });

  log.info(
    { name: result.name, categoryCount: result.categories.length },
    'Schema synthesis complete',
  );

  return result;
}
