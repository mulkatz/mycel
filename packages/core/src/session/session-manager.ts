import type {
  Session,
  SessionMetadata,
  SessionResponse,
  TurnContext,
  TurnInput,
  TurnSummary,
} from '@mycel/shared/src/types/session.types.js';
import type { PipelineState } from '@mycel/shared/src/types/agent.types.js';
import type { Pipeline, PipelineConfig } from '../orchestration/pipeline.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { KnowledgeRepository, CreateKnowledgeEntryInput } from '../repositories/knowledge.repository.js';
import { createPipeline } from '../orchestration/pipeline.js';
import { calculateCompleteness } from './completeness.js';
import { SessionError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('session:manager');

export interface SessionManagerConfig {
  readonly pipelineConfig: PipelineConfig;
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository?: KnowledgeRepository;
}

export interface SessionManager {
  startSession(input: TurnInput, metadata?: SessionMetadata): Promise<SessionResponse>;
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
  sessionId: string,
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
    sessionId,
    entry,
    personaResponse,
    followUpQuestions,
    isComplete: isComplete || completenessScore >= threshold,
    completenessScore,
    turnNumber,
  };
}

async function persistKnowledgeEntry(
  knowledgeRepo: KnowledgeRepository | undefined,
  result: PipelineState,
  sessionId: string,
  turnId: string,
  rawInput: string,
): Promise<void> {
  if (!knowledgeRepo) {
    return;
  }

  const entry = result.structuringOutput?.result.entry;
  if (!entry) {
    return;
  }

  const classifierResult = result.classifierOutput?.result;
  const input: CreateKnowledgeEntryInput = {
    sessionId,
    turnId,
    categoryId: entry.categoryId,
    subcategoryId: entry.subcategoryId,
    confidence: classifierResult?.confidence ?? 0,
    suggestedCategoryLabel: classifierResult?.suggestedCategoryLabel ?? entry.categoryId,
    topicKeywords: [...entry.tags],
    rawInput,
    title: entry.title,
    content: entry.content,
    source: entry.source,
    structuredData: entry.structuredData,
    tags: [...entry.tags],
    metadata: entry.metadata,
    followUp: entry.followUp,
  };

  await knowledgeRepo.create(input);
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  const pipeline: Pipeline = createPipeline(config.pipelineConfig);
  const sessionRepo = config.sessionRepository;
  const knowledgeRepo = config.knowledgeRepository;
  const domainConfig = config.pipelineConfig.domainConfig;
  const threshold = domainConfig.completeness?.autoCompleteThreshold ?? 0.8;
  const maxTurns = domainConfig.completeness?.maxTurns ?? 5;

  return {
    async startSession(input: TurnInput, metadata?: SessionMetadata): Promise<SessionResponse> {
      const session = await sessionRepo.create({
        domainConfigName: domainConfig.name,
        personaConfigName: config.pipelineConfig.personaConfig.name,
        metadata,
      });

      log.info({ sessionId: session.id }, 'Starting new session');

      const agentInput = {
        sessionId: session.id,
        content: input.content,
        metadata: { source: 'session' },
      };

      const result = await pipeline.run(agentInput);
      const entry = result.structuringOutput?.result.entry;
      const completenessScore = entry ? calculateCompleteness(entry, domainConfig) : 0;
      const status = completenessScore >= threshold ? 'complete' as const : 'active' as const;

      const turn = await sessionRepo.addTurn(session.id, {
        turnNumber: 1,
        input,
        pipelineResult: result,
      });

      await sessionRepo.update(session.id, {
        status,
        currentEntry: entry,
        classifierResult: result.classifierOutput,
      });

      await persistKnowledgeEntry(knowledgeRepo, result, session.id, turn.id ?? '', input.content);

      log.info(
        { sessionId: session.id, completenessScore, turnNumber: 1 },
        'Session started',
      );

      return buildSessionResponse(session.id, result, completenessScore, 1, threshold);
    },

    async continueSession(sessionId: string, input: TurnInput): Promise<SessionResponse> {
      const session = await sessionRepo.getSessionWithTurns(sessionId);
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

      const turn = await sessionRepo.addTurn(sessionId, {
        turnNumber,
        input,
        pipelineResult: result,
      });

      await sessionRepo.update(sessionId, {
        status: isAutoComplete ? 'complete' : 'active',
        currentEntry: entry ?? session.currentEntry,
      });

      await persistKnowledgeEntry(knowledgeRepo, result, sessionId, turn.id ?? '', input.content);

      log.info(
        { sessionId, completenessScore, turnNumber, isAutoComplete },
        'Session continued',
      );

      return buildSessionResponse(sessionId, result, completenessScore, turnNumber, threshold);
    },

    async endSession(sessionId: string): Promise<Session> {
      const session = await sessionRepo.getSessionWithTurns(sessionId);
      if (!session) {
        throw new SessionError(`Session not found: ${sessionId}`);
      }

      const finalStatus = session.currentEntry ? 'complete' : 'abandoned';
      await sessionRepo.update(sessionId, { status: finalStatus });

      log.info({ sessionId, status: finalStatus }, 'Session ended');

      const updated = await sessionRepo.getSessionWithTurns(sessionId);
      if (!updated) {
        throw new SessionError(`Session not found after update: ${sessionId}`);
      }
      return updated;
    },

    async getSession(sessionId: string): Promise<Session> {
      const session = await sessionRepo.getSessionWithTurns(sessionId);
      if (!session) {
        throw new SessionError(`Session not found: ${sessionId}`);
      }
      return session;
    },
  };
}
