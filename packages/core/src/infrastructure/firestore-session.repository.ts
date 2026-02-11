import type { Firestore } from '@google-cloud/firestore';
import { FieldValue, Timestamp } from '@google-cloud/firestore';
import type { Session, Turn, SessionStatus, SessionMetadata } from '@mycel/shared/src/types/session.types.js';
import type { ClassifierOutput, PipelineState } from '@mycel/shared/src/types/agent.types.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type {
  CreateSessionInput,
  CreateTurnInput,
  SessionRepository,
  UpdateSessionInput,
} from '../repositories/session.repository.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';

const SESSIONS_COLLECTION = 'sessions';
const TURNS_SUBCOLLECTION = 'turns';

interface SessionDocument {
  domainConfigName: string;
  personaConfigName: string;
  status: SessionStatus;
  turnCount: number;
  currentEntry?: Record<string, unknown>;
  classifierResult?: Record<string, unknown>;
  metadata?: SessionMetadata;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface TurnDocument {
  turnNumber: number;
  input: Record<string, unknown>;
  pipelineResult: Record<string, unknown>;
  timestamp: Timestamp;
}

function sessionFromDoc(id: string, data: SessionDocument, turns: readonly Turn[]): Session {
  return {
    id,
    domainConfigName: data.domainConfigName,
    personaConfigName: data.personaConfigName,
    status: data.status,
    turnCount: data.turnCount,
    turns,
    currentEntry: data.currentEntry as KnowledgeEntry | undefined,
    classifierResult: data.classifierResult as ClassifierOutput | undefined,
    metadata: data.metadata,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

function turnFromDoc(id: string, data: TurnDocument): Turn {
  return {
    id,
    turnNumber: data.turnNumber,
    input: data.input as unknown as Turn['input'],
    pipelineResult: data.pipelineResult as unknown as PipelineState,
    timestamp: data.timestamp.toDate(),
  };
}

export function createFirestoreSessionRepository(db: Firestore): SessionRepository {
  const sessionsRef = db.collection(SESSIONS_COLLECTION);

  return {
    async create(input: CreateSessionInput): Promise<Session> {
      const now = Timestamp.now();
      const docData: SessionDocument = {
        domainConfigName: input.domainConfigName,
        personaConfigName: input.personaConfigName,
        status: 'active',
        turnCount: 0,
        metadata: input.metadata,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = sessionsRef.doc();
      await docRef.set(docData);

      return sessionFromDoc(docRef.id, docData, []);
    },

    async getById(id: string): Promise<Session | null> {
      const doc = await sessionsRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return sessionFromDoc(id, doc.data() as SessionDocument, []);
    },

    async update(id: string, updates: UpdateSessionInput): Promise<void> {
      const updateData: Record<string, unknown> = {
        updatedAt: updates.updatedAt ? Timestamp.fromDate(updates.updatedAt) : Timestamp.now(),
      };

      if (updates.status !== undefined) {
        updateData['status'] = updates.status;
      }
      if (updates.currentEntry !== undefined) {
        updateData['currentEntry'] = updates.currentEntry;
      }
      if (updates.classifierResult !== undefined) {
        updateData['classifierResult'] = updates.classifierResult;
      }

      try {
        await sessionsRef.doc(id).update(updateData);
      } catch (error) {
        throw new PersistenceError(
          `Failed to update session ${id}`,
          error instanceof Error ? error : undefined,
        );
      }
    },

    async addTurn(sessionId: string, input: CreateTurnInput): Promise<Turn> {
      const now = Timestamp.now();
      const turnData: TurnDocument = {
        turnNumber: input.turnNumber,
        input: input.input as unknown as Record<string, unknown>,
        pipelineResult: input.pipelineResult as unknown as Record<string, unknown>,
        timestamp: now,
      };

      const turnRef = sessionsRef
        .doc(sessionId)
        .collection(TURNS_SUBCOLLECTION)
        .doc();

      await turnRef.set(turnData);
      await sessionsRef.doc(sessionId).update({
        turnCount: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });

      return turnFromDoc(turnRef.id, turnData);
    },

    async getTurns(sessionId: string): Promise<readonly Turn[]> {
      const snapshot = await sessionsRef
        .doc(sessionId)
        .collection(TURNS_SUBCOLLECTION)
        .orderBy('turnNumber', 'asc')
        .get();

      return snapshot.docs.map((doc) => turnFromDoc(doc.id, doc.data() as TurnDocument));
    },

    async getSessionWithTurns(id: string): Promise<Session | null> {
      const doc = await sessionsRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }

      const turns = await this.getTurns(id);
      return sessionFromDoc(id, doc.data() as SessionDocument, turns);
    },
  };
}
