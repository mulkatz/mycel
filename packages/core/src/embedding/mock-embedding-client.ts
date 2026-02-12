import type { EmbeddingClient } from './embedding-client.js';
import { EMBEDDING_DIMENSION } from './embedding-client.js';

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}

function generateDeterministicVector(text: string): number[] {
  const seed = hashCode(text);
  const vector: number[] = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    // Simple deterministic pseudo-random based on seed and index
    const x = Math.sin(seed * (i + 1)) * 10000;
    vector[i] = x - Math.floor(x);
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vector[i] = vector[i] / magnitude;
    }
  }

  return vector;
}

export function createMockEmbeddingClient(): EmbeddingClient {
  return {
    generateEmbedding(text: string): Promise<number[]> {
      return Promise.resolve(generateDeterministicVector(text));
    },

    generateEmbeddings(texts: string[]): Promise<number[][]> {
      return Promise.resolve(texts.map((t) => generateDeterministicVector(t)));
    },
  };
}
