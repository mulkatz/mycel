import { z } from 'zod';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import type { LlmClient } from '../../llm/llm-client.js';
import { invokeAndValidate } from '../../llm/invoke-and-validate.js';
import type { DomainAnalysis } from './types.js';

const log = createChildLogger('schema-generator:domain-analyzer');

export const DomainAnalysisSchema = z.object({
  domainType: z.string().min(1),
  subject: z.string().min(1),
  location: z.string().optional(),
  language: z.string().min(2).max(5),
  intent: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(3).max(10),
});

const SYSTEM_PROMPT = `You are a domain analysis expert. Given a description of a knowledge domain, analyze it and produce a structured analysis.

Your task:
1. Identify the domain type (e.g., "local community", "academic field", "hobbyist topic", "organizational knowledge")
2. Extract the main subject
3. Identify the location if mentioned
4. Detect the language the description is written in (ISO 639-1 code, e.g., "de", "en")
5. Determine the user's intent (e.g., "build knowledge base", "document community", "collect expertise")
6. Generate 5-10 search queries that would help understand what categories and structured fields this knowledge domain needs

For search queries:
- Focus on finding what types of information exist in this domain
- Include queries about typical categories, taxonomies, or classifications used in this field
- Include queries about what structured data is typically collected
- Make queries specific to the subject and location if applicable
- Write queries in the same language as the description

Respond with valid JSON matching this structure:
{
  "domainType": "string",
  "subject": "string",
  "location": "string or omit",
  "language": "ISO 639-1 code",
  "intent": "string",
  "searchQueries": ["query1", "query2", ...]
}`;

export async function analyzeDomain(
  description: string,
  llmClient: LlmClient,
  languageHint?: string,
): Promise<DomainAnalysis> {
  log.info({ descriptionLength: description.length }, 'Analyzing domain description');

  const userMessage = languageHint
    ? `Domain description: "${description}"\n\nLanguage hint: ${languageHint}`
    : `Domain description: "${description}"`;

  const result = await invokeAndValidate({
    llmClient,
    request: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
    },
    schema: DomainAnalysisSchema,
    agentName: 'DomainAnalyzer',
  });

  log.info(
    {
      domainType: result.domainType,
      subject: result.subject,
      queryCount: result.searchQueries.length,
    },
    'Domain analysis complete',
  );

  return result;
}
