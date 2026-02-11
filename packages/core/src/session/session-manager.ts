import { randomUUID } from 'node:crypto';
import type {
  Session,
  SessionResponse,
  TurnContext,
  TurnInput,
  TurnSummary,
} from '@mycel/shared/src/types/session.types.js';
import type { PipelineState } from '@mycel/shared/src/types/agent.types.js';
import type { Pipeline, PipelineConfig } from '../orchestration/pipeline.js';
import type { SessionStore } from './session-store.js';
import { createPipeline } from '../orchestration/pipeline.js';
import { calculateCompleteness } from './completeness.js';
import { SessionError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('session:manager');

export interface SessionManagerConfig {
  readonly pipelineConfig: PipelineConfig;
  readonly sessionStore: SessionStore;
}

export interface SessionManager {
  startSession(input: TurnInput): Promise<SessionResponse>;
  continueSession(sessionId: string, input: TurnInput): Promise<SessionResponse>;
  endSession(sessionId: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session>;
}

function buildTurnSummary(turnNumber: number, input: TurnInput, result: PipelineState): TurnSummary {
  const gaps = result.gapReasoningOutput?.result.gaps.map((g) => g.field) ?? [];
  const filledFields = Object.keys(result.structuringOutput?.result.entry.structuredData ?? {});
  return {
    turnNumber,
    userInput: input.content,
    gaps,
    filledFields,
  };
}

function collectAllQuestions(session: Session): readonly string[] {
  const questions: string[] = [];
  for (const turn of session.turns) {
    const personaQuestions = turn.pipelineResult.personaOutput?.result.followUpQuestions ?? [];
    questions.push(...personaQuestions);
  }
  return questions;
}

function buildSessionResponse(
  session: Session,
  result: PipelineState,
  completenessScore: number,
  turnNumber: number,
  threshold: number,
): SessionResponse {
  const entry = result.structuringOutput?.result.entry;
  const isComplete = result.structuringOutput?.result.isComplete ?? false;
  const personaResponse = result.personaOutput?.result.response ?? '';
  const followUpQuestions = result.personaOutput?.result.followUpQuestions ?? [];

  return {
    sessionId: session.id,
    entry,
    personaResponse,
    followUpQuestions,
    isComplete: isComplete || completenessScore >= threshold,
    completenessScore,
    turnNumber,
  };
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  const pipeline: Pipeline = createPipeline(config.pipelineConfig);
  const store = config.sessionStore;
  const domainConfig = config.pipelineConfig.domainConfig;
  const threshold = domainConfig.completeness?.autoCompleteThreshold ?? 0.8;
  const maxTurns = domainConfig.completeness?.maxTurns ?? 5;

  return {
    async startSession(input: TurnInput): Promise<SessionResponse> {
      const sessionId = randomUUID();
      log.info({ sessionId }, 'Starting new session');

      const agentInput = {
        sessionId,
        content: input.content,
        metadata: { source: 'session' },
      };

      const result = await pipeline.run(agentInput);
      const entry = result.structuringOutput?.result.entry;
      const completenessScore = entry ? calculateCompleteness(entry, domainConfig) : 0;

      const now = new Date();
      const session: Session = {
        id: sessionId,
        domainConfigName: domainConfig.name,
        personaConfigName: config.pipelineConfig.personaConfig.name,
        status: completenessScore >= threshold ? 'complete' : 'active',
        turns: [
          {
            turnNumber: 1,
            input,
            pipelineResult: result,
            timestamp: now,
          },
        ],
        currentEntry: entry,
        classifierResult: result.classifierOutput,
        createdAt: now,
        updatedAt: now,
      };

      await store.save(session);

      log.info(
        { sessionId, completenessScore, turnNumber: 1 },
        'Session started',
      );

      return buildSessionResponse(session, result, completenessScore, 1, threshold);
    },

    async continueSession(sessionId: string, input: TurnInput): Promise<SessionResponse> {
      const session = await store.load(sessionId);
      if (!session) {
        throw new SessionError(`Session not found: ${sessionId}`);
      }
      if (session.status !== 'active') {
        throw new SessionError(`Session is already ${session.status}: ${sessionId}`);
      }

      const turnNumber = session.turns.length + 1;
      if (turnNumber > maxTurns) {
        throw new SessionError(
          `Maximum turns (${String(maxTurns)}) reached for session: ${sessionId}`,
        );
      }

      log.info({ sessionId, turnNumber }, 'Continuing session');

      const previousTurns: TurnSummary[] = session.turns.map((t) =>
        buildTurnSummary(t.turnNumber, t.input, t.pipelineResult),
      );

      const askedQuestions = collectAllQuestions(session);

      const turnContext: TurnContext = {
        turnNumber,
        isFollowUp: true,
        previousTurns,
        previousEntry: session.currentEntry,
        askedQuestions,
      };

      const agentInput = {
        sessionId,
        content: input.content,
        metadata: { source: 'session' },
      };

      const result = await pipeline.run(agentInput, {
        turnContext,
        classifierOutput: session.classifierResult,
      });

      const entry = result.structuringOutput?.result.entry;
      const completenessScore = entry ? calculateCompleteness(entry, domainConfig) : 0;
      const isAutoComplete = completenessScore >= threshold;

      const now = new Date();
      const updatedSession: Session = {
        ...session,
        status: isAutoComplete ? 'complete' : 'active',
        turns: [
          ...session.turns,
          {
            turnNumber,
            input,
            pipelineResult: result,
            timestamp: now,
          },
        ],
        currentEntry: entry ?? session.currentEntry,
        updatedAt: now,
      };

      await store.save(updatedSession);

      log.info(
        { sessionId, completenessScore, turnNumber, isAutoComplete },
        'Session continued',
      );

      return buildSessionResponse(updatedSession, result, completenessScore, turnNumber, threshold);
    },

    async endSession(sessionId: string): Promise<Session> {
      const session = await store.load(sessionId);
      if (!session) {
        throw new SessionError(`Session not found: ${sessionId}`);
      }

      const finalStatus = session.currentEntry ? 'complete' : 'abandoned';
      const updatedSession: Session = {
        ...session,
        status: finalStatus,
        updatedAt: new Date(),
      };

      await store.save(updatedSession);
      log.info({ sessionId, status: finalStatus }, 'Session ended');

      return updatedSession;
    },

    async getSession(sessionId: string): Promise<Session> {
      const session = await store.load(sessionId);
      if (!session) {
        throw new SessionError(`Session not found: ${sessionId}`);
      }
      return session;
    },
  };
}
