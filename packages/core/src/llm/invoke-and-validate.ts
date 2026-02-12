import type { z } from 'zod';
import type { LlmClient, LlmRequest } from './llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError, LlmError } from '@mycel/shared/src/utils/errors.js';
import { extractJson } from './json-extraction.js';

const log = createChildLogger('llm:invoke-and-validate');

const DEFAULT_MAX_RETRIES = 1;

export interface InvokeAndValidateOptions<T extends z.ZodTypeAny> {
  readonly llmClient: LlmClient;
  readonly request: LlmRequest;
  readonly schema: T;
  readonly agentName: string;
  readonly maxRetries?: number;
}

export async function invokeAndValidate<T extends z.ZodTypeAny>(
  options: InvokeAndValidateOptions<T>,
): Promise<z.infer<T>> {
  const { llmClient, request, schema, agentName, maxRetries = DEFAULT_MAX_RETRIES } = options;

  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const currentRequest: LlmRequest =
      attempt === 0
        ? request
        : {
            ...request,
            userMessage: `${request.userMessage}\n\n[CORRECTION] Your previous response had validation errors. Please fix these issues and respond with valid JSON:\n${lastErrors.map((e) => `- ${e}`).join('\n')}`,
          };

    let response;
    try {
      response = await llmClient.invoke(currentRequest);
    } catch (error) {
      if (error instanceof LlmError) {
        throw error;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = extractJson(response.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastErrors = [`Failed to parse JSON: ${message}`];
      log.warn(
        { agentName, attempt: attempt + 1, errors: lastErrors },
        'JSON parse failed, retrying with correction',
      );
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result.data;
    }

    lastErrors = result.error.errors.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);

    log.warn(
      { agentName, attempt: attempt + 1, errors: lastErrors },
      'Zod validation failed, retrying with correction',
    );
  }

  throw new AgentError(
    `${agentName} returned invalid output after ${String(maxRetries + 1)} attempts: ${lastErrors.join(', ')}`,
  );
}
