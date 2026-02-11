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

export interface ClassifierOutput extends AgentOutput {
  readonly agentRole: 'classifier';
  readonly result: {
    readonly categoryId: string;
    readonly subcategoryId?: string;
    readonly confidence: number;
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

export interface PipelineState {
  readonly sessionId: string;
  readonly input: AgentInput;
  readonly classifierOutput?: ClassifierOutput;
  readonly gapReasoningOutput?: GapReasoningOutput;
  readonly personaResponse?: string;
  readonly structuredOutput?: Record<string, unknown>;
}
