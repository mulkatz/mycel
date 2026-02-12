export const EMBEDDING_DIMENSION = 768;
export const DEFAULT_EMBEDDING_MODEL = 'text-multilingual-embedding-002';

export interface EmbeddingClient {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
