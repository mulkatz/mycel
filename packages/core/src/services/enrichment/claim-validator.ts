import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ExtractedClaim, VerifiedClaim } from '@mycel/shared/src/types/enrichment.types.js';
import type { LlmClient } from '../../llm/llm-client.js';
import type { WebSearchClient } from '../web-search/types.js';
import type { SearchCacheRepository } from '../../repositories/search-cache.repository.js';
import { invokeAndValidate } from '../../llm/invoke-and-validate.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('enrichment:claim-validator');

const VerificationResultSchema = z.object({
  status: z.enum(['verified', 'contradicted', 'unverifiable']),
  evidence: z.string().nullish(),
  confidence: z.number().min(0).max(1),
});

const VerificationResultJsonSchema = zodToJsonSchema(VerificationResultSchema, {
  name: 'VerificationResult',
  $refStrategy: 'none',
});

export async function validateClaims(
  claims: readonly ExtractedClaim[],
  llmClient: LlmClient,
  webSearchClient: WebSearchClient,
  searchCacheRepository: SearchCacheRepository,
  maxSearches: number,
): Promise<{
  verified: readonly VerifiedClaim[];
  searchQueries: readonly string[];
  sourceUrls: readonly string[];
}> {
  const verified: VerifiedClaim[] = [];
  const allSearchQueries: string[] = [];
  const allSourceUrls: string[] = [];

  const claimsToValidate = claims.slice(0, maxSearches);

  for (const claim of claimsToValidate) {
    if (!claim.searchQuery) continue;

    try {
      // Check cache first
      let searchContent: string;
      let sourceUrls: readonly string[];
      const cached = await searchCacheRepository.get(claim.searchQuery);

      if (cached) {
        log.debug({ query: claim.searchQuery }, 'Search cache hit');
        searchContent = cached.content;
        sourceUrls = cached.sourceUrls;
      } else {
        log.debug({ query: claim.searchQuery }, 'Search cache miss, executing web search');
        const searchResult = await webSearchClient.search(
          claim.searchQuery,
          `Verifying claim: "${claim.claim}"`,
        );
        searchContent = searchResult.content;
        sourceUrls = searchResult.sourceUrls;

        // Cache the result
        await searchCacheRepository.set(claim.searchQuery, {
          content: searchContent,
          sourceUrls,
        });
      }

      allSearchQueries.push(claim.searchQuery);
      allSourceUrls.push(...sourceUrls);

      // Use LLM to compare claim vs. search result
      const verification = await invokeAndValidate({
        llmClient,
        request: {
          systemPrompt: `You are a fact-checking agent. Compare a user's claim against web search results and determine if the claim is verified, contradicted, or unverifiable.

Rules:
- "verified": The search results support the claim
- "contradicted": The search results contradict the claim (provide the correct information as evidence)
- "unverifiable": The search results don't contain enough information to verify or deny the claim
- Provide a confidence score (0-1) for your assessment
- If contradicted, include what the correct information is in the evidence field

Respond with a JSON object: { status, evidence, confidence }`,
          userMessage: `Claim: "${claim.claim}"

Web search results:
${searchContent.slice(0, 2000)}`,
          jsonSchema: VerificationResultJsonSchema as Record<string, unknown>,
        },
        schema: VerificationResultSchema,
        agentName: 'Claim validator',
      });

      verified.push({
        claim: claim.claim,
        status: verification.status,
        evidence: verification.evidence,
        sourceUrl: sourceUrls[0],
        confidence: verification.confidence,
      });

      log.info(
        { claim: claim.claim, status: verification.status, confidence: verification.confidence },
        'Claim validated',
      );
    } catch (error) {
      log.warn(
        {
          claim: claim.claim,
          error: error instanceof Error ? error.message : String(error),
        },
        'Claim validation failed, marking as unverifiable',
      );

      verified.push({
        claim: claim.claim,
        status: 'unverifiable',
        confidence: 0,
      });
    }
  }

  return {
    verified,
    searchQueries: allSearchQueries,
    sourceUrls: [...new Set(allSourceUrls)],
  };
}
