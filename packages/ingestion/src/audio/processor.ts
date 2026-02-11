import type { AudioPayload, IngestionResult } from '@mycel/shared/src/types/ingestion.types.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { IngestionError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('ingestion:audio');

export interface AudioProcessorConfig {
  readonly languageCode: string;
  readonly sampleRateHertz?: number;
}

export function processAudio(
  sessionId: string,
  payload: AudioPayload,
  _config: AudioProcessorConfig,
): Promise<IngestionResult> {
  log.info({ sessionId, uri: payload.uri }, 'Processing audio input');

  // TODO: Integrate with GCP Speech-to-Text API
  throw new IngestionError(`Audio processing not yet implemented for session ${sessionId}`);
}
