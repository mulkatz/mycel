import { Hono } from 'hono';
import { z } from 'zod';
import { DomainBehaviorConfigSchema } from '@mycel/schemas/src/domain-behavior.schema.js';
import type { SchemaGenerator } from '@mycel/core/src/services/schema-generator/types.js';
import type { AppEnv } from '../types.js';

export interface SchemaGeneratorRouteDeps {
  readonly schemaGenerator: SchemaGenerator;
}

const GenerateSchemaRequestSchema = z.object({
  description: z.string().min(10),
  language: z.string().min(2).max(5).optional(),
  config: z
    .union([
      z.enum(['full_auto', 'balanced']),
      DomainBehaviorConfigSchema,
    ])
    .optional(),
  partialSchema: z
    .object({
      categories: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            description: z.string(),
            requiredFields: z.array(z.string()).optional(),
            optionalFields: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const ReviewRequestSchema = z.object({
  decision: z.enum(['approve', 'approve_with_changes', 'reject']),
  modifications: z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      categories: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            description: z.string(),
            requiredFields: z.array(z.string()).optional(),
            optionalFields: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  feedback: z.string().optional(),
});

export function createSchemaGeneratorRoutes(deps: SchemaGeneratorRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/generate', async (c) => {
    const body: unknown = await c.req.json();
    const input = GenerateSchemaRequestSchema.parse(body);

    const result = await deps.schemaGenerator.generate({
      description: input.description,
      language: input.language,
      config: input.config,
      partialSchema: input.partialSchema,
    });

    return c.json(
      {
        proposalId: result.proposalId,
        status: result.status,
        domain: result.domain,
        behavior: result.behavior,
        reasoning: result.reasoning,
        sources: result.sources,
      },
      201,
    );
  });

  routes.post('/proposals/:proposalId/review', async (c) => {
    const { proposalId } = c.req.param();
    const body: unknown = await c.req.json();
    const input = ReviewRequestSchema.parse(body);

    const result = await deps.schemaGenerator.reviewProposal(proposalId, {
      decision: input.decision,
      modifications: input.modifications,
      feedback: input.feedback,
    });

    return c.json(result);
  });

  routes.get('/proposals/:proposalId', async (c) => {
    const { proposalId } = c.req.param();

    const proposal = await deps.schemaGenerator.getProposal(proposalId);
    if (!proposal) {
      return c.json(
        {
          error: `Proposal not found: ${proposalId}`,
          code: 'PROPOSAL_NOT_FOUND',
          requestId: c.get('requestId'),
        },
        404,
      );
    }

    return c.json(proposal);
  });

  return routes;
}
