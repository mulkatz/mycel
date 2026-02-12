import { Annotation } from '@langchain/langgraph';
import type {
  AgentInput,
  ClassifierOutput,
  ContextDispatcherOutput,
  GapReasoningOutput,
  PersonaOutput,
  StructuringOutput,
} from '@mycel/shared/src/types/agent.types.js';
import type { TurnContext } from '@mycel/shared/src/types/session.types.js';

export const PipelineGraphAnnotation = Annotation.Root({
  sessionId: Annotation<string>,
  input: Annotation<AgentInput>,
  classifierOutput: Annotation<ClassifierOutput | undefined>,
  contextDispatcherOutput: Annotation<ContextDispatcherOutput | undefined>,
  gapReasoningOutput: Annotation<GapReasoningOutput | undefined>,
  personaOutput: Annotation<PersonaOutput | undefined>,
  structuringOutput: Annotation<StructuringOutput | undefined>,
  turnContext: Annotation<TurnContext | undefined>,
  activeCategory: Annotation<string | undefined>,
});

export type PipelineGraphState = typeof PipelineGraphAnnotation.State;
