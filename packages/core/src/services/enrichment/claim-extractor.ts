import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ExtractedClaim } from '@mycel/shared/src/types/enrichment.types.js';
import type { LlmClient } from '../../llm/llm-client.js';
import { invokeAndValidate } from '../../llm/invoke-and-validate.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('enrichment:claim-extractor');

const ExtractedClaimSchema = z.object({
  claim: z.string().min(1),
  verifiable: z.boolean(),
  searchQuery: z.string().optional(),
});

const ClaimExtractionSchema = z.object({
  claims: z.array(ExtractedClaimSchema).max(5),
});

const ClaimExtractionJsonSchema = zodToJsonSchema(ClaimExtractionSchema, {
  name: 'ClaimExtraction',
  $refStrategy: 'none',
});

export async function extractClaims(
  userInput: string,
  llmClient: LlmClient,
): Promise<readonly ExtractedClaim[]> {
  log.info({ inputLength: userInput.length }, 'Extracting verifiable claims');

  const result = await invokeAndValidate({
    llmClient,
    request: {
      systemPrompt: `You are a claim extraction agent. Extract factual claims from user input that can be verified via web search.

Rules:
- Skip opinions, feelings, and personal experiences
- Skip vague or subjective statements
- Only extract concrete, verifiable facts (dates, names, locations, historical events, statistics)
- For each verifiable claim, provide a concise search query that would help verify it
- Maximum 5 claims
- If no verifiable claims are found, return an empty array

Respond with a JSON object containing:
- claims: array of { claim, verifiable, searchQuery }`,
      userMessage: userInput,
      jsonSchema: ClaimExtractionJsonSchema as Record<string, unknown>,
    },
    schema: ClaimExtractionSchema,
    agentName: 'Claim extractor',
  });

  const verifiable = result.claims.filter((c) => c.verifiable && c.searchQuery);

  log.info(
    { totalClaims: result.claims.length, verifiableClaims: verifiable.length },
    'Claim extraction complete',
  );

  return verifiable;
}
