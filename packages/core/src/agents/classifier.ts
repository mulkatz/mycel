import type { AgentInput, ClassifierOutput } from '@mycel/shared/src/types/agent.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';

const log = createChildLogger('agent:classifier');

export interface ClassifierAgent {
  classify(input: AgentInput): Promise<ClassifierOutput>;
}

export function createClassifierAgent(domainConfig: DomainConfig): ClassifierAgent {
  const categoryIds = domainConfig.categories.map((c) => c.id);

  return {
    classify(input: AgentInput): Promise<ClassifierOutput> {
      log.info({ sessionId: input.sessionId }, 'Classifying input');

      if (categoryIds.length === 0) {
        throw new AgentError('No categories configured in domain schema');
      }

      // TODO: Integrate with Vertex AI for classification
      throw new AgentError('Classifier agent not yet implemented');
    },
  };
}
