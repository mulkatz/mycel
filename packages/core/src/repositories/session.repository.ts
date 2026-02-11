import type {
  Session,
  SessionMetadata,
  SessionStatus,
  Turn,
  TurnInput,
} from '@mycel/shared/src/types/session.types.js';
import type { PipelineState } from '@mycel/shared/src/types/agent.types.js';

export interface CreateSessionInput {
  readonly domainConfigName: string;
  readonly personaConfigName: string;
  readonly metadata?: SessionMetadata;
}

export interface UpdateSessionInput {
  readonly status?: SessionStatus;
  readonly currentEntry?: Session['currentEntry'];
  readonly classifierResult?: Session['classifierResult'];
  readonly updatedAt?: Date;
}

export interface CreateTurnInput {
  readonly turnNumber: number;
  readonly input: TurnInput;
  readonly pipelineResult: PipelineState;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<Session>;
  getById(id: string): Promise<Session | null>;
  update(id: string, updates: UpdateSessionInput): Promise<void>;
  addTurn(sessionId: string, turn: CreateTurnInput): Promise<Turn>;
  getTurns(sessionId: string): Promise<readonly Turn[]>;
  getSessionWithTurns(id: string): Promise<Session | null>;
}
