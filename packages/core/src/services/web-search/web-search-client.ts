import { createChildLogger } from '@mycel/shared/src/logger.js';
import { ConfigurationError, LlmError } from '@mycel/shared/src/utils/errors.js';
import type { WebSearchClient, WebSearchResult } from './types.js';

const log = createChildLogger('web-search:client');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface WebSearchClientConfig {
  readonly projectId: string;
  readonly location: string;
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  const transientPatterns = [
    '429',
    'rate limit',
    'too many requests',
    '500',
    '502',
    '503',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'econnreset',
    'etimedout',
    'timeout',
  ];
  return transientPatterns.some((pattern) => message.includes(pattern));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY_MS;
  return exponential + jitter;
}

interface GroundingChunk {
  readonly web?: {
    readonly uri?: string;
  };
}

interface GroundingMetadata {
  readonly groundingChunks?: readonly GroundingChunk[];
}

interface GenAiCandidate {
  readonly groundingMetadata?: GroundingMetadata;
}

interface GenAiResponse {
  readonly text?: string;
  readonly candidates?: readonly GenAiCandidate[];
}

function extractSourceUrls(response: GenAiResponse): string[] {
  const urls: string[] = [];
  const candidates = response.candidates ?? [];
  for (const candidate of candidates) {
    const chunks = candidate.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        urls.push(chunk.web.uri);
      }
    }
  }
  return [...new Set(urls)];
}

export function createWebSearchClient(config: WebSearchClientConfig): WebSearchClient {
  const { projectId, location } = config;

  if (!projectId) {
    throw new ConfigurationError('Project ID is required for WebSearchClient');
  }

  log.info({ projectId, location }, 'Creating web search client');

  return {
    async search(query: string, systemContext?: string): Promise<WebSearchResult> {
      log.debug({ query }, 'Executing web search');

      const { GoogleGenAI } = await import('@google/genai');

      const client = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location,
      });

      let lastError: Error | undefined;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const prompt = systemContext
            ? `${systemContext}\n\nResearch the following topic and provide a comprehensive summary:\n${query}`
            : `Research the following topic and provide a comprehensive summary:\n${query}`;

          const response = await client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });

          const content = response.text ?? '';
          const sourceUrls = extractSourceUrls(response as GenAiResponse);

          log.debug({ query, sourceCount: sourceUrls.length }, 'Web search completed');

          return { query, content, sourceUrls };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (!isTransientError(error)) {
            throw new LlmError(
              `Web search failed: ${lastError.message}`,
              false,
              lastError,
            );
          }

          log.warn(
            { attempt: attempt + 1, maxRetries: MAX_RETRIES, error: lastError.message },
            'Transient web search error, retrying',
          );

          if (attempt < MAX_RETRIES - 1) {
            await sleep(computeBackoffMs(attempt));
          }
        }
      }

      throw new LlmError(
        `Web search failed after ${String(MAX_RETRIES)} retries: ${lastError?.message ?? 'unknown error'}`,
        true,
        lastError,
      );
    },
  };
}
