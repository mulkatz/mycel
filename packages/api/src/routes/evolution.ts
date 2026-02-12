import { Hono } from 'hono';
import { z } from 'zod';
import type { SchemaEvolutionService } from '@mycel/core/src/services/schema-evolution/types.js';
import type { AppEnv } from '../types.js';

export interface EvolutionRouteDeps {
  readonly schemaEvolutionService: SchemaEvolutionService;
}

const ReviewRequestSchema = z.object({
  decision: z.enum(['approve', 'approve_with_changes', 'reject']),
  feedback: z.string().optional(),
});

export function createEvolutionRoutes(deps: EvolutionRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/:domainSchemaId/evolution/analyze', async (c) => {
    const { domainSchemaId } = c.req.param();
    const proposals = await deps.schemaEvolutionService.analyze(domainSchemaId);

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

  routes.get('/:domainSchemaId/evolution/proposals', async (c) => {
    const { domainSchemaId } = c.req.param();
    const proposals = await deps.schemaEvolutionService.getProposals(domainSchemaId);

    return c.json({
      domainSchemaId,
      proposals: proposals.map((p) => ({
        id: p.id,
        type: p.type,
        description: p.description,
        confidence: p.confidence,
        status: p.status,
        newCategory: p.newCategory,
        newField: p.newField,
        changePriority: p.changePriority,
        clusterMetadata: p.clusterMetadata,
        createdAt: p.createdAt.toISOString(),
        reviewedAt: p.reviewedAt?.toISOString(),
        appliedAt: p.appliedAt?.toISOString(),
      })),
    });
  });

  routes.get('/:domainSchemaId/evolution/proposals/:proposalId', async (c) => {
    const { proposalId } = c.req.param();
    const proposals = await deps.schemaEvolutionService.getProposals(c.req.param('domainSchemaId'));
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

    return c.json(proposal);
  });

  routes.post('/:domainSchemaId/evolution/proposals/:proposalId/review', async (c) => {
    const { proposalId } = c.req.param();
    const body: unknown = await c.req.json();
    const input = ReviewRequestSchema.parse(body);

    const result = await deps.schemaEvolutionService.reviewProposal(proposalId, {
      decision: input.decision,
      feedback: input.feedback,
    });

    return c.json(result);
  });

  routes.get('/:domainSchemaId/evolution/stats', async (c) => {
    const { domainSchemaId } = c.req.param();
    const stats = await deps.schemaEvolutionService.getFieldStats(domainSchemaId);

    return c.json({
      domainSchemaId,
      stats: stats.map((s) => ({
        categoryId: s.categoryId,
        fieldName: s.fieldName,
        timesAsked: s.timesAsked,
        timesAnswered: s.timesAnswered,
        answerRate: s.answerRate,
        lastUpdatedAt: s.lastUpdatedAt.toISOString(),
      })),
    });
  });

  return routes;
}
