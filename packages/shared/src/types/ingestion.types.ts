export type InputModality = 'audio' | 'image' | 'text';

export interface IngestionRequest {
  readonly sessionId: string;
  readonly modality: InputModality;
  readonly payload: AudioPayload | ImagePayload | TextPayload;
}

export interface AudioPayload {
  readonly modality: 'audio';
  readonly uri: string;
  readonly mimeType: string;
  readonly languageHint?: string;
}

export interface ImagePayload {
  readonly modality: 'image';
  readonly uri: string;
  readonly mimeType: string;
}

export interface TextPayload {
  readonly modality: 'text';
  readonly content: string;
  readonly language?: string;
}

export interface IngestionResult {
  readonly sessionId: string;
  readonly modality: InputModality;
  readonly extractedText: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}
