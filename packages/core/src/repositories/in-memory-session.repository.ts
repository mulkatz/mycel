import { randomUUID } from 'node:crypto';
import type { Session, Turn } from '@mycel/shared/src/types/session.types.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateSessionInput,
  CreateTurnInput,
  ListSessionsInput,
  SessionRepository,
  UpdateSessionInput,
} from './session.repository.js';

export function createInMemorySessionRepository(): SessionRepository {
  const sessions = new Map<string, Session>();
  const turns = new Map<string, Turn[]>();

  return {
    create(input: CreateSessionInput): Promise<Session> {
      const now = new Date();
      const session: Session = {
        id: randomUUID(),
        domainConfigName: input.domainConfigName,
        personaConfigName: input.personaConfigName,
        status: 'active',
        turnCount: 0,
        turns: [],
        createdAt: now,
        updatedAt: now,
        metadata: input.metadata,
      };
      sessions.set(session.id, session);
      turns.set(session.id, []);
      return Promise.resolve(session);
    },

    getById(id: string): Promise<Session | null> {
      return Promise.resolve(sessions.get(id) ?? null);
    },

    list(input?: ListSessionsInput): Promise<readonly Session[]> {
      let results = [...sessions.values()];
      if (input?.status) {
        results = results.filter((s) => s.status === input.status);
      }
      results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const limit = input?.limit ?? 50;
      return Promise.resolve(results.slice(0, limit));
    },

    update(id: string, updates: UpdateSessionInput): Promise<void> {
      const session = sessions.get(id);
      if (!session) {
        return Promise.reject(new PersistenceError(`Session not found: ${id}`));
      }
      const updated: Session = {
        ...session,
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.currentEntry !== undefined && { currentEntry: updates.currentEntry }),
        ...(updates.classifierResult !== undefined && {
          classifierResult: updates.classifierResult,
        }),
        updatedAt: updates.updatedAt ?? new Date(),
      };
      sessions.set(id, updated);
      return Promise.resolve();
    },

    addTurn(sessionId: string, input: CreateTurnInput): Promise<Turn> {
      const sessionTurns = turns.get(sessionId);
      if (!sessionTurns) {
        return Promise.reject(new Error(`Session not found: ${sessionId}`));
      }
      const turn: Turn = {
        id: randomUUID(),
        turnNumber: input.turnNumber,
        input: input.input,
        pipelineResult: input.pipelineResult,
        timestamp: new Date(),
      };
      sessionTurns.push(turn);

      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, {
          ...session,
          turnCount: session.turnCount + 1,
          turns: [...session.turns, turn],
          updatedAt: new Date(),
        });
      }

      return Promise.resolve(turn);
    },

    getTurns(sessionId: string): Promise<readonly Turn[]> {
      return Promise.resolve(turns.get(sessionId) ?? []);
    },

    getSessionWithTurns(id: string): Promise<Session | null> {
      const session = sessions.get(id);
      if (!session) {
        return Promise.resolve(null);
      }
      const sessionTurns = turns.get(id) ?? [];
      return Promise.resolve({
        ...session,
        turns: sessionTurns,
      });
    },
  };
}
