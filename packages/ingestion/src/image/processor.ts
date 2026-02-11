import type { ImagePayload, IngestionResult } from '@mycel/shared/src/types/ingestion.types.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { IngestionError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('ingestion:image');

export interface ImageProcessorConfig {
  readonly enableOcr: boolean;
  readonly enableObjectDetection: boolean;
}

export function processImage(
  sessionId: string,
  payload: ImagePayload,
  _config: ImageProcessorConfig,
): Promise<IngestionResult> {
  log.info({ sessionId, uri: payload.uri }, 'Processing image input');

  // TODO: Integrate with Vertex AI Vision API
  throw new IngestionError(`Image processing not yet implemented for session ${sessionId}`);
}
