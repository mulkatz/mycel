import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { DomainBehaviorConfigSchema } from '@mycel/schemas/src/domain-behavior.schema.js';
import { createRouter, type AppEnv } from '../types.js';
import {
  ErrorResponseSchema,
  SchemaGenerateResponseSchema,
  SchemaReviewResponseSchema,
  SchemaProposalResponseSchema,
} from '../schemas/responses.js';

const GenerateSchemaRequestSchema = z
  .object({
    description: z.string().min(10),
    language: z.string().min(2).max(5).optional(),
    config: z
      .union([
        z.enum(['full_auto', 'balanced']),
        DomainBehaviorConfigSchema.refine(
          (c) => c.schemaCreation !== 'manual',
          { message: 'Manual schema creation mode cannot be used with /generate' },
        ),
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
  })
  .openapi('GenerateSchemaRequest');

const ReviewRequestSchema = z
  .object({
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
  })
  .openapi('SchemaReviewRequest');

const generateSchemaRoute = createRoute({
  method: 'post',
  path: '/generate',
  tags: ['Schema Generator'],
  summary: 'Generate a domain schema proposal',
  request: {
    body: {
      content: {
        'application/json': {
          schema: GenerateSchemaRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Schema proposal generated',
      content: {
        'application/json': {
          schema: SchemaGenerateResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const reviewProposalRoute = createRoute({
  method: 'post',
  path: '/proposals/{proposalId}/review',
  tags: ['Schema Generator'],
  summary: 'Review a schema proposal',
  request: {
    params: z.object({
      proposalId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: ReviewRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Review result',
      content: {
        'application/json': {
          schema: SchemaReviewResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const getProposalRoute = createRoute({
  method: 'get',
  path: '/proposals/{proposalId}',
  tags: ['Schema Generator'],
  summary: 'Get a schema proposal',
  request: {
    params: z.object({
      proposalId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Schema proposal details',
      content: {
        'application/json': {
          schema: SchemaProposalResponseSchema,
        },
      },
    },
    404: {
      description: 'Proposal not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createSchemaGeneratorRoutes(): OpenAPIHono<AppEnv> {
  const routes = createRouter();

  routes.openapi(generateSchemaRoute, async (c) => {
    const input = c.req.valid('json');
    const { schemaGenerator } = c.get('tenantRepos');

    const result = await schemaGenerator.generate({
      description: input.description,
      language: input.language,
      config: input.config,
      partialSchema: input.partialSchema,
    });

    return c.json(
      {
        proposalId: result.proposalId,
        status: result.status,
        domain: {
          ...result.domain,
          categories: result.domain.categories.map((cat) => ({ ...cat })),
        },
        behavior: result.behavior,
        reasoning: result.reasoning,
        sources: [...result.sources],
      },
      201,
    );
  });

  routes.openapi(reviewProposalRoute, async (c) => {
    const { proposalId } = c.req.valid('param');
    const input = c.req.valid('json');
    const { schemaGenerator } = c.get('tenantRepos');

    const result = await schemaGenerator.reviewProposal(proposalId, {
      decision: input.decision,
      modifications: input.modifications,
      feedback: input.feedback,
    });

    return c.json(
      {
        status: result.status,
        proposalId: result.proposalId,
        domainSchemaId: result.domainSchemaId,
      },
      200,
    );
  });

  routes.openapi(getProposalRoute, async (c) => {
    const { proposalId } = c.req.valid('param');
    const { schemaGenerator } = c.get('tenantRepos');

    const proposal = await schemaGenerator.getProposal(proposalId);
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

    return c.json(
      {
        id: proposal.id,
        status: proposal.status,
        reasoning: proposal.reasoning,
        sources: [...proposal.sources],
        createdAt: proposal.createdAt.toISOString(),
      },
      200,
    );
  });

  return routes;
}
