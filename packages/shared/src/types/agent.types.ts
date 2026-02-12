import type { KnowledgeEntry, KnowledgeSearchResult } from './knowledge.types.js';
import type { TurnContext } from './session.types.js';

export type AgentRole =
  | 'classifier'
  | 'context-dispatcher'
  | 'gap-reasoning'
  | 'persona'
  | 'structuring';

export interface AgentInput {
  readonly sessionId: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
}

export interface AgentOutput {
  readonly agentRole: AgentRole;
  readonly result: Record<string, unknown>;
  readonly confidence: number;
  readonly reasoning?: string;
}

export type ClassifierIntent = 'content' | 'greeting' | 'proactive_request' | 'dont_know';

export interface ClassifierOutput extends AgentOutput {
  readonly agentRole: 'classifier';
  readonly result: {
    readonly categoryId: string;
    readonly subcategoryId?: string | null;
    readonly confidence: number;
    readonly intent: ClassifierIntent;
    readonly isTopicChange?: boolean;
    readonly summary?: string;
    readonly suggestedCategoryLabel?: string;
  };
}

export interface ContextDispatcherOutput extends AgentOutput {
  readonly agentRole: 'context-dispatcher';
  readonly result: {
    readonly relevantContext: readonly KnowledgeSearchResult[];
    readonly contextSummary: string;
  };
}

export interface GapReasoningOutput extends AgentOutput {
  readonly agentRole: 'gap-reasoning';
  readonly result: {
    readonly gaps: readonly KnowledgeGap[];
    readonly followUpQuestions: readonly string[];
  };
}

export interface KnowledgeGap {
  readonly field: string;
  readonly description: string;
  readonly priority: 'high' | 'medium' | 'low';
}

export interface PersonaOutput extends AgentOutput {
  readonly agentRole: 'persona';
  readonly result: {
    readonly response: string;
    readonly followUpQuestions: readonly string[];
  };
}

export interface StructuringOutput extends AgentOutput {
  readonly agentRole: 'structuring';
  readonly result: {
    readonly entry: KnowledgeEntry;
    readonly isComplete: boolean;
    readonly missingFields: readonly string[];
  };
}

export interface PipelineState {
  readonly sessionId: string;
  readonly input: AgentInput;
  readonly classifierOutput?: ClassifierOutput;
  readonly contextDispatcherOutput?: ContextDispatcherOutput;
  readonly gapReasoningOutput?: GapReasoningOutput;
  readonly personaOutput?: PersonaOutput;
  readonly structuringOutput?: StructuringOutput;
  readonly turnContext?: TurnContext;
  readonly activeCategory?: string;
}
