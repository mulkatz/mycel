import type { Session } from '@mycel/shared/src/types/session.types.js';
import type { SessionStore } from './session-store.js';

export function createInMemorySessionStore(): SessionStore {
  const sessions = new Map<string, Session>();

  return {
    save(session: Session): Promise<void> {
      sessions.set(session.id, session);
      return Promise.resolve();
    },

    load(sessionId: string): Promise<Session | undefined> {
      return Promise.resolve(sessions.get(sessionId));
    },

    delete(sessionId: string): Promise<void> {
      sessions.delete(sessionId);
      return Promise.resolve();
    },
  };
}
