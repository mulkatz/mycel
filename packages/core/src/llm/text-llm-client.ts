import { createChildLogger } from '@mycel/shared/src/logger.js';
import { ConfigurationError, LlmError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('llm:text-client');

const MAX_TRANSIENT_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface TextLlmRequest {
  readonly systemPrompt: string;
  readonly userMessage: string;
}

export interface TextLlmResponse {
  readonly content: string;
  readonly tokenUsage?: {
    readonly input: number;
    readonly output: number;
  };
}

export interface TextLlmClient {
  invoke(request: TextLlmRequest): Promise<TextLlmResponse>;
}

function createMockTextClient(): TextLlmClient {
  log.info('Using mock text LLM client');

  return {
    invoke(request: TextLlmRequest): Promise<TextLlmResponse> {
      log.debug({ systemPromptLength: request.systemPrompt.length }, 'Mock text LLM invocation');

      const content =
        '## Chapter\n\nThis is a mock chapter with placeholder prose about the collected knowledge.\n';

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

async function createVertexTextClient(): Promise<TextLlmClient> {
  const projectId = process.env['MYCEL_GCP_PROJECT_ID'] ?? process.env['GCP_PROJECT_ID'];
  const location = process.env['VERTEX_AI_LOCATION'] ?? 'europe-west1';

  if (!projectId) {
    throw new ConfigurationError(
      'MYCEL_GCP_PROJECT_ID environment variable is required for Vertex AI text LLM client',
    );
  }

  const { ChatVertexAI } = await import('@langchain/google-vertexai');

  const model = new ChatVertexAI({
    model: 'gemini-2.0-flash',
    location,
    temperature: 0.4,
    authOptions: { projectId },
    responseMimeType: 'text/plain',
  });

  log.info({ projectId, location }, 'Using Vertex AI text LLM client');

  return {
    async invoke(request: TextLlmRequest): Promise<TextLlmResponse> {
      log.debug(
        { systemPromptLength: request.systemPrompt.length },
        'Vertex AI text LLM invocation',
      );

      let lastError: Error | undefined;

      for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt++) {
        try {
          const response = await model.invoke([
            ['system', request.systemPrompt],
            ['human', request.userMessage],
          ]);

          const content =
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content);

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
              `Vertex AI text invocation failed: ${lastError.message}`,
              false,
              lastError,
            );
          }

          log.warn(
            { attempt: attempt + 1, maxRetries: MAX_TRANSIENT_RETRIES, error: lastError.message },
            'Transient text LLM error, retrying',
          );

          if (attempt < MAX_TRANSIENT_RETRIES - 1) {
            await sleep(computeBackoffMs(attempt));
          }
        }
      }

      throw new LlmError(
        `Vertex AI text invocation failed after ${String(MAX_TRANSIENT_RETRIES)} retries: ${lastError?.message ?? 'unknown error'}`,
        true,
        lastError,
      );
    },
  };
}

export async function createTextLlmClient(): Promise<TextLlmClient> {
  if (process.env['MYCEL_MOCK_LLM'] === 'true') {
    return createMockTextClient();
  }

  return createVertexTextClient();
}
