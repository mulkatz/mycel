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
import type {
  KnowledgeRepository,
  CreateKnowledgeEntryInput,
} from '../repositories/knowledge.repository.js';
import type { EmbeddingClient } from '../embedding/embedding-client.js';
import { buildEmbeddingText } from '../embedding/embedding-text-builder.js';
import { DEFAULT_EMBEDDING_MODEL } from '../embedding/embedding-client.js';
import { createPipeline } from '../orchestration/pipeline.js';
import { calculateCompleteness } from './completeness.js';
import { generateGreeting } from './greeting.js';
import { SessionError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('session:manager');

export interface SessionManagerConfig {
  readonly pipelineConfig: PipelineConfig;
  readonly sessionRepository: SessionRepository;
  readonly knowledgeRepository?: KnowledgeRepository;
  readonly embeddingClient?: EmbeddingClient;
}

export interface InitSessionResult {
  readonly sessionId: string;
  readonly greeting: string;
}

export interface SessionManager {
  initSession(metadata?: SessionMetadata): Promise<InitSessionResult>;
  startSession(input: TurnInput, metadata?: SessionMetadata): Promise<SessionResponse>;
  continueSession(sessionId: string, input: TurnInput): Promise<SessionResponse>;
  endSession(sessionId: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session>;
}

function buildTurnSummary(
  turnNumber: number,
  input: TurnInput,
  result: PipelineState,
): TurnSummary {
  const gaps = result.gapReasoningOutput?.result.gaps.map((g) => g.field) ?? [];
  const filledFields = Object.keys(result.structuringOutput?.result.entry?.structuredData ?? {});
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

function collectSkippedFields(session: Session): readonly string[] {
  const skipped: string[] = [];
  for (let i = 0; i < session.turns.length; i++) {
    const turn = session.turns[i];
    const intent = turn.pipelineResult.classifierOutput?.result.intent;
    if (intent === 'dont_know' && i > 0) {
      const prevTurn = session.turns[i - 1];
      const prevGaps = prevTurn.pipelineResult.gapReasoningOutput?.result.gaps ?? [];
      skipped.push(...prevGaps.map((g) => g.field));
    }
  }
  return [...new Set(skipped)];
}

function buildSessionResponse(
  sessionId: string,
  result: PipelineState,
  completenessScore: number,
  turnNumber: number,
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
    isComplete: isComplete || completenessScore >= 1.0,
    completenessScore,
    turnNumber,
  };
}

async function persistKnowledgeEntry(
  knowledgeRepo: KnowledgeRepository | undefined,
  embeddingClient: EmbeddingClient | undefined,
  domainSchemaId: string,
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

  let embedding: number[] | undefined;
  let embeddingModel: string | undefined;

  if (embeddingClient) {
    try {
      const text = buildEmbeddingText(entry);
      embedding = await embeddingClient.generateEmbedding(text);
      embeddingModel = process.env['MYCEL_EMBEDDING_MODEL'] ?? DEFAULT_EMBEDDING_MODEL;
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : String(error), sessionId },
        'Embedding generation failed, persisting without embedding',
      );
    }
  }

  const classifierResult = result.classifierOutput?.result;
  const isUncategorized = entry.categoryId === '_uncategorized';
  const input: CreateKnowledgeEntryInput = {
    sessionId,
    turnId,
    categoryId: entry.categoryId,
    subcategoryId: entry.subcategoryId,
    confidence: classifierResult?.confidence ?? 0,
    suggestedCategoryLabel: isUncategorized
      ? (classifierResult?.suggestedCategoryLabel ?? 'unknown')
      : undefined,
    topicKeywords: [...entry.tags],
    rawInput,
    domainSchemaId,
    title: entry.title,
    content: entry.content,
    source: entry.source,
    structuredData: entry.structuredData,
    tags: [...entry.tags],
    metadata: entry.metadata,
    followUp: entry.followUp,
    embedding,
    embeddingModel,
  };

  await knowledgeRepo.create(input);
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  const pipelineConfig: PipelineConfig = {
    ...config.pipelineConfig,
    embeddingClient: config.embeddingClient ?? config.pipelineConfig.embeddingClient,
    knowledgeRepository: config.knowledgeRepository ?? config.pipelineConfig.knowledgeRepository,
  };
  const pipeline: Pipeline = createPipeline(pipelineConfig);
  const sessionRepo = config.sessionRepository;
  const knowledgeRepo = config.knowledgeRepository;
  const embeddingClient = config.embeddingClient ?? config.pipelineConfig.embeddingClient;
  const domainConfig = config.pipelineConfig.domainConfig;

  return {
    async initSession(metadata?: SessionMetadata): Promise<InitSessionResult> {
      const session = await sessionRepo.create({
        domainConfigName: domainConfig.name,
        personaConfigName: config.pipelineConfig.personaConfig.name,
        metadata,
      });

      log.info({ sessionId: session.id }, 'Initializing session with greeting');

      const greeting = await generateGreeting(
        config.pipelineConfig.personaConfig,
        domainConfig,
        config.pipelineConfig.llmClient,
      );

      log.info({ sessionId: session.id }, 'Session initialized');

      return { sessionId: session.id, greeting };
    },

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
      const completenessScore = calculateCompleteness(entry, domainConfig);

      const turn = await sessionRepo.addTurn(session.id, {
        turnNumber: 1,
        input,
        pipelineResult: result,
      });

      await sessionRepo.update(session.id, {
        status: 'active',
        currentEntry: entry,
        classifierResult: result.classifierOutput,
      });

      await persistKnowledgeEntry(
        knowledgeRepo,
        embeddingClient,
        domainConfig.name,
        result,
        session.id,
        turn.id ?? '',
        input.content,
      );

      log.info({ sessionId: session.id, completenessScore, turnNumber: 1 }, 'Session started');

      return buildSessionResponse(session.id, result, completenessScore, 1);
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

      log.info({ sessionId, turnNumber }, 'Continuing session');

      const previousTurns: TurnSummary[] = session.turns.map((t) =>
        buildTurnSummary(t.turnNumber, t.input, t.pipelineResult),
      );

      const askedQuestions = collectAllQuestions(session);
      const skippedFields = collectSkippedFields(session);

      const isFirstTurn = session.turns.length === 0;

      const turnContext: TurnContext = {
        turnNumber,
        isFollowUp: !isFirstTurn,
        previousTurns,
        previousEntry: session.currentEntry,
        askedQuestions,
        skippedFields,
      };

      const agentInput = {
        sessionId,
        content: input.content,
        metadata: { source: 'session' },
      };

      const activeCategory = session.classifierResult?.result.categoryId;

      const result = await pipeline.run(agentInput, {
        turnContext,
        activeCategory,
      });

      const isTopicChange = result.classifierOutput?.result.isTopicChange === true;

      if (isTopicChange) {
        log.info(
          {
            sessionId,
            oldCategory: activeCategory,
            newCategory: result.classifierOutput.result.categoryId,
          },
          'Topic change detected',
        );
      }

      const entry = result.structuringOutput?.result.entry;
      const completenessScore = calculateCompleteness(entry, domainConfig);

      const turn = await sessionRepo.addTurn(sessionId, {
        turnNumber,
        input,
        pipelineResult: result,
      });

      // Only update currentEntry and classifierResult when we have an entry (content intent)
      // For greeting/proactive intents, keep the existing session state
      const hasEntry = entry !== undefined;
      await sessionRepo.update(sessionId, {
        status: 'active',
        currentEntry: hasEntry ? entry : session.currentEntry,
        classifierResult: hasEntry
          ? (isTopicChange
              ? result.classifierOutput
              : (session.classifierResult ?? result.classifierOutput))
          : session.classifierResult,
      });

      // Only persist knowledge entry for content intents
      if (hasEntry) {
        await persistKnowledgeEntry(
          knowledgeRepo,
          embeddingClient,
          domainConfig.name,
          result,
          sessionId,
          turn.id ?? '',
          input.content,
        );
      }

      log.info({ sessionId, completenessScore, turnNumber, isTopicChange }, 'Session continued');

      return buildSessionResponse(sessionId, result, completenessScore, turnNumber);
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
