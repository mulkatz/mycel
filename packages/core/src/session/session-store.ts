import type { Session } from '@mycel/shared/src/types/session.types.js';

export interface SessionStore {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | undefined>;
  delete(sessionId: string): Promise<void>;
}
