import type { EmbeddingClient } from './embedding-client.js';
import { EMBEDDING_DIMENSION, DEFAULT_EMBEDDING_MODEL } from './embedding-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { ConfigurationError, LlmError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('embedding:vertex');

export function createVertexEmbeddingClient(): EmbeddingClient {
  const projectId = process.env['MYCEL_GCP_PROJECT_ID'] ?? process.env['GCP_PROJECT_ID'];
  const location = process.env['VERTEX_AI_LOCATION'] ?? 'europe-west1';
  const model = process.env['MYCEL_EMBEDDING_MODEL'] ?? DEFAULT_EMBEDDING_MODEL;

  if (!projectId) {
    throw new ConfigurationError(
      'MYCEL_GCP_PROJECT_ID environment variable is required for Vertex AI embedding client',
    );
  }

  const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;

  log.info({ projectId, location, model }, 'Initializing Vertex AI embedding client');

  let clientInstance: unknown;

  async function getClient(): Promise<unknown> {
    if (!clientInstance) {
      const { v1 } = await import('@google-cloud/aiplatform');
      clientInstance = new v1.PredictionServiceClient({
        apiEndpoint: `${location}-aiplatform.googleapis.com`,
        projectId,
      });
    }
    return clientInstance;
  }

  async function embed(texts: string[]): Promise<number[][]> {
    try {
      const client = await getClient();
      const instances = texts.map((text) => ({
        structValue: {
          fields: {
            content: { stringValue: text },
          },
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const [response] = await (client as any).predict({
        endpoint,
        instances,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const predictions: Array<{ values: number[] }> | undefined = response?.predictions;
      if (!predictions || predictions.length !== texts.length) {
        throw new LlmError(
          `Unexpected embedding response: expected ${String(texts.length)} predictions, got ${String(predictions?.length ?? 0)}`,
          false,
        );
      }

      return predictions.map((p) => {
        const values = p.values;
        if (values.length !== EMBEDDING_DIMENSION) {
          throw new LlmError(
            `Unexpected embedding dimension: expected ${String(EMBEDDING_DIMENSION)}, got ${String(values.length)}`,
            false,
          );
        }
        return values;
      });
    } catch (error) {
      if (error instanceof LlmError) {
        throw error;
      }
      throw new LlmError(
        `Vertex AI embedding failed: ${error instanceof Error ? error.message : String(error)}`,
        false,
        error instanceof Error ? error : undefined,
      );
    }
  }

  return {
    async generateEmbedding(text: string): Promise<number[]> {
      log.debug({ textLength: text.length }, 'Generating single embedding');
      const [result] = await embed([text]);
      return result;
    },

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
      log.debug({ count: texts.length }, 'Generating batch embeddings');
      return embed(texts);
    },
  };
}
