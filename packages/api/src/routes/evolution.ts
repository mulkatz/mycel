import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.js';

const ReviewRequestSchema = z.object({
  decision: z.enum(['approve', 'approve_with_changes', 'reject']),
  feedback: z.string().optional(),
});

export function createEvolutionRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/:domainSchemaId/evolution/analyze', async (c) => {
    const { domainSchemaId } = c.req.param();
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

  routes.get('/:domainSchemaId/evolution/proposals', async (c) => {
    const { domainSchemaId } = c.req.param();
    const { schemaEvolutionService } = c.get('tenantRepos');
    const proposals = await schemaEvolutionService.getProposals(domainSchemaId);

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
    const { schemaEvolutionService } = c.get('tenantRepos');
    const proposals = await schemaEvolutionService.getProposals(c.req.param('domainSchemaId'));
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
    const { schemaEvolutionService } = c.get('tenantRepos');

    const result = await schemaEvolutionService.reviewProposal(proposalId, {
      decision: input.decision,
      feedback: input.feedback,
    });

    return c.json(result);
  });

  routes.get('/:domainSchemaId/evolution/stats', async (c) => {
    const { domainSchemaId } = c.req.param();
    const { schemaEvolutionService } = c.get('tenantRepos');
    const stats = await schemaEvolutionService.getFieldStats(domainSchemaId);

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
