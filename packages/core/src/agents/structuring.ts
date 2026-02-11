import type { AgentInput, AgentOutput } from '@mycel/shared/src/types/agent.types.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('agent:structuring');

export interface StructuringOutput extends AgentOutput {
  readonly agentRole: 'structuring';
  readonly result: {
    readonly entry: KnowledgeEntry;
    readonly isComplete: boolean;
    readonly missingFields: readonly string[];
  };
}

export interface StructuringAgent {
  structure(input: AgentInput, categoryId: string): Promise<StructuringOutput>;
}

export function createStructuringAgent(domainConfig: DomainConfig): StructuringAgent {
  return {
    structure(input: AgentInput, categoryId: string): Promise<StructuringOutput> {
      log.info({ sessionId: input.sessionId, categoryId }, 'Structuring knowledge entry');

      const category = domainConfig.categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new AgentError(`Unknown category: ${categoryId}`);
      }

      // TODO: Integrate with Vertex AI for structured extraction
      throw new AgentError('Structuring agent not yet implemented');
    },
  };
}
