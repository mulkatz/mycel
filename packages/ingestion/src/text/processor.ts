import type { TextPayload, IngestionResult } from '@mycel/shared/src/types/ingestion.types.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('ingestion:text');

export function processText(sessionId: string, payload: TextPayload): Promise<IngestionResult> {
  log.info({ sessionId }, 'Processing text input');

  return Promise.resolve({
    sessionId,
    modality: 'text',
    extractedText: payload.content,
    confidence: 1.0,
    metadata: {
      language: payload.language,
      characterCount: payload.content.length,
    },
  });
}
