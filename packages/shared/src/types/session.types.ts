import type { KnowledgeEntry } from './knowledge.types.js';
import type { ClassifierOutput, PipelineState } from './agent.types.js';

export type SessionStatus = 'active' | 'complete' | 'abandoned';

export interface SessionMetadata {
  readonly source?: 'cli' | 'api' | 'web';
  readonly userId?: string;
}

export interface TurnInput {
  readonly content: string;
  readonly isFollowUpResponse: boolean;
  readonly respondingToQuestions?: readonly string[];
}

export interface Turn {
  readonly id?: string;
  readonly turnNumber: number;
  readonly input: TurnInput;
  readonly pipelineResult: PipelineState;
  readonly timestamp: Date;
}

export interface Session {
  readonly id: string;
  readonly domainConfigName: string;
  readonly personaConfigName: string;
  readonly status: SessionStatus;
  readonly turns: readonly Turn[];
  readonly currentEntry?: KnowledgeEntry;
  readonly classifierResult?: ClassifierOutput;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata?: SessionMetadata;
}

export interface SessionResponse {
  readonly sessionId: string;
  readonly entry?: KnowledgeEntry;
  readonly personaResponse: string;
  readonly followUpQuestions: readonly string[];
  readonly isComplete: boolean;
  readonly completenessScore: number;
  readonly turnNumber: number;
}

export interface TurnContext {
  readonly turnNumber: number;
  readonly isFollowUp: boolean;
  readonly previousTurns: readonly TurnSummary[];
  readonly previousEntry?: KnowledgeEntry;
  readonly askedQuestions: readonly string[];
}

export interface TurnSummary {
  readonly turnNumber: number;
  readonly userInput: string;
  readonly gaps: readonly string[];
  readonly filledFields: readonly string[];
}
