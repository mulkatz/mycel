import { createChildLogger } from '@mycel/shared/src/logger.js';
import { ConfigurationError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('llm:client');

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

function createMockResponse(systemPrompt: string): string {
  const prompt = systemPrompt.toLowerCase();

  if (prompt.includes('classifier') || prompt.includes('classification')) {
    return JSON.stringify({
      categoryId: 'history',
      subcategoryId: undefined,
      confidence: 0.85,
      reasoning: 'The input references historical events and time periods.',
    });
  }

  if (prompt.includes('gap-reasoning') || prompt.includes('gap analysis')) {
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

  if (prompt.includes('persona')) {
    return JSON.stringify({
      response:
        'Thank you for sharing this knowledge! I have a few questions to fill in some gaps.',
      followUpQuestions: [
        'Can you tell me more about the time period?',
        'Do you know of any written sources about this?',
      ],
    });
  }

  if (prompt.includes('structuring') || prompt.includes('structured')) {
    return JSON.stringify({
      title: 'Historical Knowledge Entry',
      content: 'A historical account shared by a community member.',
      structuredData: {},
      tags: ['history', 'community'],
      isComplete: false,
      missingFields: ['period', 'sources'],
    });
  }

  return JSON.stringify({ result: 'Mock LLM response' });
}

function createMockClient(): LlmClient {
  log.info('Using mock LLM client');

  return {
    invoke(request: LlmRequest): Promise<LlmResponse> {
      log.debug({ systemPromptLength: request.systemPrompt.length }, 'Mock LLM invocation');

      const content = createMockResponse(request.systemPrompt);

      return Promise.resolve({
        content,
        tokenUsage: { input: 100, output: 50 },
      });
    },
  };
}

async function createVertexClient(): Promise<LlmClient> {
  const projectId = process.env['GCP_PROJECT_ID'];
  const location = process.env['VERTEX_AI_LOCATION'] ?? 'europe-west1';

  if (!projectId) {
    throw new ConfigurationError(
      'GCP_PROJECT_ID environment variable is required for Vertex AI LLM client',
    );
  }

  const { ChatVertexAI } = await import('@langchain/google-vertexai');

  const model = new ChatVertexAI({
    model: 'gemini-2.0-flash',
    location,
    temperature: 0.2,
    authOptions: { projectId },
  });

  log.info({ projectId, location }, 'Using Vertex AI LLM client');

  return {
    async invoke(request: LlmRequest): Promise<LlmResponse> {
      log.debug({ systemPromptLength: request.systemPrompt.length }, 'Vertex AI LLM invocation');

      const response = await model.invoke([
        ['system', request.systemPrompt],
        ['human', request.userMessage],
      ]);

      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      return {
        content,
        tokenUsage: response.usage_metadata
          ? {
              input: response.usage_metadata.input_tokens,
              output: response.usage_metadata.output_tokens,
            }
          : undefined,
      };
    },
  };
}

export async function createLlmClient(): Promise<LlmClient> {
  if (process.env['MYCEL_MOCK_LLM'] === 'true') {
    return createMockClient();
  }

  return createVertexClient();
}
