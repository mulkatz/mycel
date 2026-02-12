import { createChildLogger } from '@mycel/shared/src/logger.js';
import { ConfigurationError, LlmError } from '@mycel/shared/src/utils/errors.js';
import { extractJson } from './json-extraction.js';

const log = createChildLogger('llm:client');

const MAX_TRANSIENT_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface LlmRequest {
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly jsonSchema?: Record<string, unknown>;
}

export interface LlmResponse {
  readonly content: string;
  readonly tokenUsage?: {
    readonly input: number;
    readonly output: number;
  };
}

export interface LlmClient {
  invoke(request: LlmRequest): Promise<LlmResponse>;
}

function parseMockTurnNumber(prompt: string): number {
  const match = /follow-up turn\s+(\d+)/i.exec(prompt);
  return match ? parseInt(match[1], 10) : 1;
}

function createMockResponse(systemPrompt: string, userMessage: string): string {
  const prompt = systemPrompt.toLowerCase();
  const isFollowUp = prompt.includes('[follow_up_context]');
  const turnNumber = parseMockTurnNumber(systemPrompt);
  const isUncategorized = prompt.includes('exploratory mode') || prompt.includes('uncategorized');

  // Check gap-reasoning, persona, and structuring BEFORE classifier because
  // uncategorized prompts for those agents contain "Classifier summary:" which
  // would incorrectly match the classifier branch.
  if (prompt.includes('gap-reasoning') || prompt.includes('gap analysis')) {
    if (isFollowUp && turnNumber >= 3) {
      return JSON.stringify({
        gaps: [],
        followUpQuestions: [],
        reasoning: 'All required fields have been filled.',
      });
    }

    if (isUncategorized && isFollowUp) {
      return JSON.stringify({
        gaps: [],
        followUpQuestions: [],
        reasoning: 'Uncategorized topic is now well understood after follow-up.',
      });
    }

    if (isUncategorized) {
      return JSON.stringify({
        gaps: [
          { field: 'timeframe', description: 'When did this happen?', priority: 'medium' },
          { field: 'location', description: 'Where did this take place?', priority: 'medium' },
        ],
        followUpQuestions: [
          'When did this happen?',
          'Where exactly was this?',
          'Is this something that happens regularly here?',
        ],
        reasoning:
          'The input is uncategorized. Asking exploratory questions to understand the topic.',
      });
    }

    if (isFollowUp) {
      return JSON.stringify({
        gaps: [
          {
            field: 'sources',
            description: 'No sources or references provided',
            priority: 'medium',
          },
        ],
        followUpQuestions: ['Do you have any sources or references for this information?'],
        reasoning: 'Period has been provided. Only sources remain missing.',
      });
    }
    return JSON.stringify({
      gaps: [
        { field: 'period', description: 'The exact time period is unclear', priority: 'high' },
        {
          field: 'sources',
          description: 'No sources or references provided',
          priority: 'medium',
        },
      ],
      followUpQuestions: [
        'Can you specify the exact time period?',
        'Do you have any sources or references for this information?',
      ],
      reasoning: 'Key required fields are missing from the input.',
    });
  }

  if (prompt.includes('your persona')) {
    if (isFollowUp && turnNumber >= 3) {
      return JSON.stringify({
        response: 'Super, jetzt haben wir ein richtig gutes Bild! Fällt dir noch was anderes ein?',
        followUpQuestions: [],
      });
    }
    if (isFollowUp) {
      return JSON.stringify({
        response: 'Spannend! Gibt es dazu vielleicht schriftliche Quellen oder Aufzeichnungen?',
        followUpQuestions: ['Do you have any written sources or references for this?'],
      });
    }
    return JSON.stringify({
      response:
        '1732, Barockstil — das ist ja wirklich alt! Weißt du, aus welcher Zeit genau das stammt?',
      followUpQuestions: [
        'Can you tell me more about the time period?',
        'Do you know of any written sources about this?',
      ],
    });
  }

  if (prompt.includes('structuring') || prompt.includes('structured')) {
    if (isFollowUp && turnNumber >= 3) {
      return JSON.stringify({
        title: 'Historical Knowledge Entry',
        content: 'A historical account shared by a community member, with full details.',
        structuredData: { period: '18th century', sources: 'Church records' },
        tags: ['history', 'community', 'architecture'],
        isComplete: true,
        missingFields: [],
      });
    }

    if (isUncategorized && isFollowUp) {
      return JSON.stringify({
        title: 'Personal Memory',
        content: 'A personal account shared by a community member, with additional details.',
        structuredData: {
          suggestedCategoryLabel: 'Personal Memories',
          topicKeywords: ['personal', 'memory', 'community', 'village'],
        },
        tags: ['personal', 'memory', 'community'],
        isComplete: true,
        missingFields: [],
      });
    }

    if (isUncategorized) {
      return JSON.stringify({
        title: 'Personal Memory',
        content: 'A personal account shared by a community member.',
        structuredData: {
          suggestedCategoryLabel: 'Personal Memories',
          topicKeywords: ['personal', 'memory', 'community'],
        },
        tags: ['personal', 'memory'],
        isComplete: false,
        missingFields: ['timeframe', 'location'],
      });
    }

    if (isFollowUp) {
      return JSON.stringify({
        title: 'Historical Knowledge Entry',
        content: 'A historical account shared by a community member, with period details.',
        structuredData: { period: '18th century' },
        tags: ['history', 'community'],
        isComplete: false,
        missingFields: ['sources'],
      });
    }
    return JSON.stringify({
      title: 'Historical Knowledge Entry',
      content: 'A historical account shared by a community member.',
      structuredData: {},
      tags: ['history', 'community'],
      isComplete: false,
      missingFields: ['period', 'sources'],
    });
  }

  if (prompt.includes('classifier') || prompt.includes('classification')) {
    const input = userMessage.toLowerCase();
    const hasSessionContext = prompt.includes('[session_context]');
    const looksHistorical =
      input.includes('church') ||
      input.includes('built') ||
      input.includes('century') ||
      input.includes('historical');
    const looksNature =
      input.includes('lake') ||
      input.includes('see') ||
      input.includes('forest') ||
      input.includes('tree');

    if (looksNature && hasSessionContext) {
      return JSON.stringify({
        categoryId: 'nature',
        subcategoryId: undefined,
        confidence: 0.85,
        isTopicChange: true,
        reasoning: 'The user changed from a different topic to discussing nature.',
      });
    }

    if (looksHistorical) {
      return JSON.stringify({
        categoryId: 'history',
        subcategoryId: undefined,
        confidence: 0.85,
        isTopicChange: false,
        reasoning: 'The input references historical events and time periods.',
      });
    }

    return JSON.stringify({
      categoryId: '_uncategorized',
      confidence: 0.3,
      isTopicChange: false,
      reasoning: 'The input does not clearly fit any existing category.',
      summary: 'A personal account or observation shared by a community member.',
      suggestedCategoryLabel: 'Personal Memories',
    });
  }

  return JSON.stringify({ result: 'Mock LLM response' });
}

function createMockClient(): LlmClient {
  log.info('Using mock LLM client');

  return {
    invoke(request: LlmRequest): Promise<LlmResponse> {
      log.debug({ systemPromptLength: request.systemPrompt.length }, 'Mock LLM invocation');

      const content = createMockResponse(request.systemPrompt, request.userMessage);

      return Promise.resolve({
        content,
        tokenUsage: { input: 100, output: 50 },
      });
    },
  };
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorRecord = error as unknown as Record<string, unknown>;
  const statusCode =
    (typeof errorRecord['status'] === 'number' ? errorRecord['status'] : undefined) ??
    (typeof errorRecord['statusCode'] === 'number' ? errorRecord['statusCode'] : undefined);

  if (typeof statusCode === 'number' && (statusCode === 429 || statusCode >= 500)) {
    return true;
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
    'network',
    'socket hang up',
    'econnrefused',
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

async function createVertexClient(): Promise<LlmClient> {
  const projectId = process.env['MYCEL_GCP_PROJECT_ID'] ?? process.env['GCP_PROJECT_ID'];
  const location = process.env['VERTEX_AI_LOCATION'] ?? 'europe-west1';

  if (!projectId) {
    throw new ConfigurationError(
      'MYCEL_GCP_PROJECT_ID environment variable is required for Vertex AI LLM client',
    );
  }

  const { ChatVertexAI } = await import('@langchain/google-vertexai');

  const model = new ChatVertexAI({
    model: 'gemini-2.0-flash',
    location,
    temperature: 0.2,
    authOptions: { projectId },
    responseMimeType: 'application/json',
  });

  log.info({ projectId, location }, 'Using Vertex AI LLM client');

  return {
    async invoke(request: LlmRequest): Promise<LlmResponse> {
      log.debug({ systemPromptLength: request.systemPrompt.length }, 'Vertex AI LLM invocation');

      let lastError: Error | undefined;

      for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt++) {
        try {
          const response = await model.invoke([
            ['system', request.systemPrompt],
            ['human', request.userMessage],
          ]);

          const rawContent =
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content);

          // Validate that the response is parseable JSON, using extractJson as safety net
          const parsed = extractJson(rawContent);
          const content = JSON.stringify(parsed);

          return {
            content,
            tokenUsage: response.usage_metadata
              ? {
                  input: response.usage_metadata.input_tokens,
                  output: response.usage_metadata.output_tokens,
                }
              : undefined,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (!isTransientError(error)) {
            throw new LlmError(
              `Vertex AI invocation failed: ${lastError.message}`,
              false,
              lastError,
            );
          }

          log.warn(
            { attempt: attempt + 1, maxRetries: MAX_TRANSIENT_RETRIES, error: lastError.message },
            'Transient LLM error, retrying',
          );

          if (attempt < MAX_TRANSIENT_RETRIES - 1) {
            await sleep(computeBackoffMs(attempt));
          }
        }
      }

      throw new LlmError(
        `Vertex AI invocation failed after ${String(MAX_TRANSIENT_RETRIES)} retries: ${lastError?.message ?? 'unknown error'}`,
        true,
        lastError,
      );
    },
  };
}

export async function createLlmClient(): Promise<LlmClient> {
  if (process.env['MYCEL_MOCK_LLM'] === 'true') {
    return createMockClient();
  }

  return createVertexClient();
}
