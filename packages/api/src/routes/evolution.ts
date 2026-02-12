import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRouter, type AppEnv } from '../types.js';
import {
  ErrorResponseSchema,
  EvolutionAnalyzeResponseSchema,
  EvolutionProposalDetailSchema,
  EvolutionProposalsResponseSchema,
  EvolutionReviewResponseSchema,
  EvolutionStatsResponseSchema,
} from '../schemas/responses.js';

const DomainSchemaIdParamSchema = z.object({
  domainSchemaId: z.string().min(1),
});

const DomainAndProposalParamSchema = z.object({
  domainSchemaId: z.string().min(1),
  proposalId: z.string().min(1),
});

const EvolutionReviewRequestSchema = z.object({
  decision: z.enum(['approve', 'approve_with_changes', 'reject']),
  feedback: z.string().optional(),
});

const analyzeRoute = createRoute({
  method: 'post',
  path: '/{domainSchemaId}/evolution/analyze',
  tags: ['Evolution'],
  summary: 'Analyze domain schema for evolution proposals',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    201: {
      description: 'Analysis completed',
      content: {
        'application/json': {
          schema: EvolutionAnalyzeResponseSchema,
        },
      },
    },
  },
});

const listProposalsRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/evolution/proposals',
  tags: ['Evolution'],
  summary: 'List evolution proposals for a domain',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'List of evolution proposals',
      content: {
        'application/json': {
          schema: EvolutionProposalsResponseSchema,
        },
      },
    },
  },
});

const getProposalRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/evolution/proposals/{proposalId}',
  tags: ['Evolution'],
  summary: 'Get a specific evolution proposal',
  request: {
    params: DomainAndProposalParamSchema,
  },
  responses: {
    200: {
      description: 'Evolution proposal details',
      content: {
        'application/json': {
          schema: EvolutionProposalDetailSchema,
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

const reviewProposalRoute = createRoute({
  method: 'post',
  path: '/{domainSchemaId}/evolution/proposals/{proposalId}/review',
  tags: ['Evolution'],
  summary: 'Review an evolution proposal',
  request: {
    params: DomainAndProposalParamSchema,
    body: {
      content: {
        'application/json': {
          schema: EvolutionReviewRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Review result',
      content: {
        'application/json': {
          schema: EvolutionReviewResponseSchema,
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

const getStatsRoute = createRoute({
  method: 'get',
  path: '/{domainSchemaId}/evolution/stats',
  tags: ['Evolution'],
  summary: 'Get field usage stats for a domain',
  request: {
    params: DomainSchemaIdParamSchema,
  },
  responses: {
    200: {
      description: 'Field usage statistics',
      content: {
        'application/json': {
          schema: EvolutionStatsResponseSchema,
        },
      },
    },
  },
});

export function createEvolutionRoutes(): OpenAPIHono<AppEnv> {
  const routes = createRouter();

  routes.openapi(analyzeRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { schemaEvolutionService } = c.get('tenantRepos');
    const proposals = await schemaEvolutionService.analyze(domainSchemaId);

    return c.json(
      {
        domainSchemaId,
        proposalCount: proposals.length,
        proposals: proposals.map((p) => ({
          id: p.id,
          type: p.type,
          description: p.description,
          confidence: p.confidence,
          status: p.status,
        })),
      },
      201,
    );
  });

  routes.openapi(listProposalsRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { schemaEvolutionService } = c.get('tenantRepos');
    const proposals = await schemaEvolutionService.getProposals(domainSchemaId);

    return c.json(
      {
        domainSchemaId,
        proposals: proposals.map((p) => ({
          id: p.id,
          type: p.type,
          description: p.description,
          confidence: p.confidence,
          status: p.status,
          newCategory: p.newCategory
            ? { id: p.newCategory.id, label: p.newCategory.label, description: p.newCategory.description, suggestedFields: [...p.newCategory.suggestedFields] }
            : null,
          newField: p.newField ? { ...p.newField } : null,
          changePriority: p.changePriority ? { ...p.changePriority } : null,
          clusterMetadata: p.clusterMetadata ? { ...p.clusterMetadata } : null,
          createdAt: p.createdAt.toISOString(),
          reviewedAt: p.reviewedAt?.toISOString(),
          appliedAt: p.appliedAt?.toISOString(),
        })),
      },
      200,
    );
  });

  routes.openapi(getProposalRoute, async (c) => {
    const { domainSchemaId, proposalId } = c.req.valid('param');
    const { schemaEvolutionService } = c.get('tenantRepos');
    const proposals = await schemaEvolutionService.getProposals(domainSchemaId);
    const proposal = proposals.find((p) => p.id === proposalId);

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
        type: proposal.type,
        description: proposal.description,
        confidence: proposal.confidence,
        status: proposal.status,
        newCategory: proposal.newCategory
          ? { id: proposal.newCategory.id, label: proposal.newCategory.label, description: proposal.newCategory.description, suggestedFields: [...proposal.newCategory.suggestedFields] }
          : null,
        newField: proposal.newField ? { ...proposal.newField } : null,
        changePriority: proposal.changePriority ? { ...proposal.changePriority } : null,
        clusterMetadata: proposal.clusterMetadata ? { ...proposal.clusterMetadata } : null,
        createdAt: proposal.createdAt.toISOString(),
        reviewedAt: proposal.reviewedAt?.toISOString(),
        appliedAt: proposal.appliedAt?.toISOString(),
      },
      200,
    );
  });

  routes.openapi(reviewProposalRoute, async (c) => {
    const { proposalId } = c.req.valid('param');
    const input = c.req.valid('json');
    const { schemaEvolutionService } = c.get('tenantRepos');

    const result = await schemaEvolutionService.reviewProposal(proposalId, {
      decision: input.decision,
      feedback: input.feedback,
    });

    return c.json(
      {
        status: result.status,
        id: result.proposalId,
      },
      200,
    );
  });

  routes.openapi(getStatsRoute, async (c) => {
    const { domainSchemaId } = c.req.valid('param');
    const { schemaEvolutionService } = c.get('tenantRepos');
    const stats = await schemaEvolutionService.getFieldStats(domainSchemaId);

    return c.json(
      {
        domainSchemaId,
        stats: stats.map((s) => ({
          categoryId: s.categoryId,
          fieldName: s.fieldName,
          timesAsked: s.timesAsked,
          timesAnswered: s.timesAnswered,
          answerRate: s.answerRate,
          lastUpdatedAt: s.lastUpdatedAt.toISOString(),
        })),
      },
      200,
    );
  });

  return routes;
}
