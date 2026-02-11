import { randomUUID } from 'node:crypto';
import type { StructuringOutput } from '@mycel/shared/src/types/agent.types.js';
import type { KnowledgeEntry } from '@mycel/shared/src/types/knowledge.types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PipelineGraphState } from '../orchestration/pipeline-state.js';
import type { LlmClient } from '../llm/llm-client.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';
import { AgentError } from '@mycel/shared/src/utils/errors.js';
import { StructuredEntrySchema, StructuredEntryJsonSchema } from './agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';

const log = createChildLogger('agent:structuring');

export function createStructuringNode(
  domainConfig: DomainConfig,
  llmClient: LlmClient,
): (state: PipelineGraphState) => Promise<Partial<PipelineGraphState>> {
  return async (state: PipelineGraphState): Promise<Partial<PipelineGraphState>> => {
    const categoryId = state.classifierOutput?.result.categoryId;
    if (!categoryId) {
      throw new AgentError('Structuring requires classifier output with a categoryId');
    }

    log.info({ sessionId: state.sessionId, categoryId }, 'Structuring knowledge entry');

    const category = domainConfig.categories.find((c) => c.id === categoryId);
    if (!category) {
      throw new AgentError(`Unknown category: ${categoryId}`);
    }

    const requiredFields = category.requiredFields ?? [];
    const optionalFields = category.optionalFields ?? [];

    const gapInfo = state.gapReasoningOutput
      ? `Identified gaps: ${state.gapReasoningOutput.result.gaps.map((g) => g.field).join(', ')}`
      : 'No gap analysis available.';

    let followUpContext = '';
    if (state.turnContext?.isFollowUp && state.turnContext.previousEntry) {
      const existing = state.turnContext.previousEntry;
      followUpContext = `
[FOLLOW_UP_CONTEXT]
This is follow-up turn ${String(state.turnContext.turnNumber)}. Merge new information into the existing entry.

Existing entry:
- Title: ${existing.title}
- Content: ${existing.content}
- Structured data: ${JSON.stringify(existing.structuredData)}
- Tags: ${existing.tags.join(', ')}

Merge the new information: update structuredData with newly provided fields, append to content, and update tags. Keep the existing title unless the new information warrants a better one.
`;
    }

    const systemPrompt = `You are a structuring agent. Extract structured knowledge from the user's input for the "${category.label}" category.

Required fields: ${requiredFields.length > 0 ? requiredFields.join(', ') : 'none'}
Optional fields: ${optionalFields.length > 0 ? optionalFields.join(', ') : 'none'}

${gapInfo}
${followUpContext}
Create a structured knowledge entry with:
- title: a concise title for this knowledge entry
- content: the full content, cleaned up and well-structured
- structuredData: extracted field values as key-value pairs
- tags: relevant tags for categorization
- isComplete: whether all required fields are filled
- missingFields: list of required fields that are still missing

Respond with a JSON object.

Example response:
{"title": "Village Church History", "content": "The village church was built in the 18th century.", "structuredData": {"period": "18th century"}, "tags": ["history", "architecture"], "isComplete": false, "missingFields": ["sources"]}`;

    const result = await invokeAndValidate({
      llmClient,
      request: {
        systemPrompt,
        userMessage: state.input.content,
        jsonSchema: StructuredEntryJsonSchema as Record<string, unknown>,
      },
      schema: StructuredEntrySchema,
      agentName: 'Structuring',
    });

    const now = new Date();
    const previousEntry = state.turnContext?.previousEntry;

    const gaps = state.gapReasoningOutput?.result.gaps ?? [];
    const followUpQuestions = state.gapReasoningOutput?.result.followUpQuestions ?? [];

    const entry: KnowledgeEntry = {
      id: previousEntry?.id ?? randomUUID(),
      categoryId,
      subcategoryId: state.classifierOutput?.result.subcategoryId,
      title: result.title,
      content: result.content,
      source: {
        type: 'text',
        processingDetails: {
          extractedText: state.input.content,
          confidence: state.classifierOutput?.confidence,
        },
      },
      structuredData: result.structuredData,
      tags: result.tags,
      metadata: state.input.metadata,
      followUp:
        gaps.length > 0 || followUpQuestions.length > 0
          ? {
              gaps: gaps.map((g) => `${g.field}: ${g.description}`),
              suggestedQuestions: followUpQuestions,
            }
          : undefined,
      createdAt: previousEntry?.createdAt ?? now,
      updatedAt: now,
    };

    const structuringOutput: StructuringOutput = {
      agentRole: 'structuring',
      result: {
        entry,
        isComplete: result.isComplete,
        missingFields: result.missingFields,
      },
      confidence: 1.0,
    };

    log.info(
      {
        sessionId: state.sessionId,
        entryId: entry.id,
        isComplete: result.isComplete,
      },
      'Structuring complete',
    );

    return { structuringOutput };
  };
}
