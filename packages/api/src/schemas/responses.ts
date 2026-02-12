import { z } from 'zod';

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string(),
    requestId: z.string(),
    details: z.array(z.string()).optional(),
  })
  .openapi('ErrorResponse');

// Health
export const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
  })
  .openapi('HealthResponse');

// Sessions
export const CreateSessionResponseSchema = z
  .object({
    sessionId: z.string(),
    status: z.literal('active'),
    greeting: z.string(),
  })
  .openapi('CreateSessionResponse');

export const TurnResponseSchema = z
  .object({
    sessionId: z.string(),
    turnIndex: z.number(),
    response: z.string(),
    knowledgeExtracted: z.boolean(),
    status: z.string(),
  })
  .openapi('TurnResponse');

export const SessionDetailResponseSchema = z
  .object({
    sessionId: z.string(),
    status: z.string(),
    turnCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    knowledgeEntryCount: z.number(),
  })
  .openapi('SessionDetailResponse');

export const EndSessionResponseSchema = z
  .object({
    sessionId: z.string(),
    status: z.string(),
    turnCount: z.number(),
    knowledgeEntryCount: z.number(),
    summary: z.string(),
  })
  .openapi('EndSessionResponse');

// Entries
export const EnrichmentClaimSchema = z.object({
  claim: z.string(),
  status: z.string(),
  evidence: z.string().optional(),
  confidence: z.number(),
  sourceUrl: z.string().optional(),
});

export const EntryEnrichmentResponseSchema = z
  .object({
    entryId: z.string(),
    status: z.enum(['enriched', 'not_enriched']),
    enrichment: z
      .object({
        claims: z.array(EnrichmentClaimSchema),
        enrichedAt: z.string(),
        searchQueries: z.array(z.string()),
        sourceUrls: z.array(z.string()),
      })
      .nullable(),
  })
  .openapi('EntryEnrichmentResponse');

// Documents
export const ChapterSummarySchema = z.object({
  filename: z.string(),
  title: z.string(),
  entryCount: z.number(),
  gapCount: z.number(),
});

export const DocumentGenerateResponseSchema = z
  .object({
    status: z.literal('completed'),
    meta: z.object({
      generatedAt: z.string(),
      domainSchemaId: z.string(),
      contentLanguage: z.string(),
      totalEntries: z.number(),
      totalChapters: z.number(),
      chaptersWithContent: z.number(),
      chaptersEmpty: z.number(),
      gapsIdentified: z.number(),
      sourceEntryIds: z.array(z.string()),
      generationDurationMs: z.number(),
    }),
    chapters: z.array(ChapterSummarySchema),
  })
  .openapi('DocumentGenerateResponse');

export const DocumentMetaResponseSchema = z
  .object({
    generatedAt: z.string(),
    domainSchemaId: z.string(),
    contentLanguage: z.string(),
    totalEntries: z.number(),
    totalChapters: z.number(),
    chaptersWithContent: z.number(),
    chaptersEmpty: z.number(),
    gapsIdentified: z.number(),
    sourceEntryIds: z.array(z.string()),
    generationDurationMs: z.number(),
  })
  .openapi('DocumentMetaResponse');

// Schema Generator
export const CategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  requiredFields: z.array(z.string()).optional(),
  optionalFields: z.array(z.string()).optional(),
  origin: z.string().optional(),
  sourceUrls: z.array(z.string()).optional(),
});

export const SchemaGenerateResponseSchema = z
  .object({
    proposalId: z.string(),
    status: z.string(),
    domain: z.object({
      name: z.string(),
      version: z.string(),
      description: z.string(),
      categories: z.array(CategorySchema),
    }),
    behavior: z.record(z.unknown()).optional(),
    reasoning: z.string(),
    sources: z.array(z.string()).optional(),
  })
  .openapi('SchemaGenerateResponse');

export const SchemaReviewResponseSchema = z
  .object({
    status: z.string(),
    domainSchemaId: z.string().optional(),
    proposalId: z.string().optional(),
  })
  .openapi('SchemaReviewResponse');

export const SchemaProposalResponseSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    domain: z.record(z.unknown()).optional(),
    behavior: z.record(z.unknown()).optional(),
    reasoning: z.string().optional(),
    sources: z.array(z.string()).optional(),
    createdAt: z.string().optional(),
  })
  .openapi('SchemaProposalResponse');

// Evolution
export const EvolutionProposalSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  confidence: z.number(),
  status: z.string(),
});

export const EvolutionAnalyzeResponseSchema = z
  .object({
    domainSchemaId: z.string(),
    proposalCount: z.number(),
    proposals: z.array(EvolutionProposalSummarySchema),
  })
  .openapi('EvolutionAnalyzeResponse');

export const NewCategorySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    suggestedFields: z.array(z.string()),
  })
  .nullable()
  .optional();

export const NewFieldSchema = z
  .object({
    targetCategoryId: z.string(),
    fieldName: z.string(),
    fieldType: z.enum(['required', 'optional']),
    reasoning: z.string(),
  })
  .nullable()
  .optional();

export const ChangePrioritySchema = z
  .object({
    targetCategoryId: z.string(),
    fieldName: z.string(),
    answerRate: z.number(),
    reasoning: z.string(),
  })
  .nullable()
  .optional();

export const ClusterMetadataSchema = z
  .object({
    clusterSize: z.number().optional(),
    sampleEntries: z.array(z.string()).optional(),
  })
  .nullable()
  .optional();

export const EvolutionProposalDetailSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  confidence: z.number(),
  status: z.string(),
  newCategory: NewCategorySchema,
  newField: NewFieldSchema,
  changePriority: ChangePrioritySchema,
  clusterMetadata: ClusterMetadataSchema,
  createdAt: z.string(),
  reviewedAt: z.string().nullable().optional(),
  appliedAt: z.string().nullable().optional(),
});

export const EvolutionProposalsResponseSchema = z
  .object({
    domainSchemaId: z.string(),
    proposals: z.array(EvolutionProposalDetailSchema.openapi('EvolutionProposalDetail')),
  })
  .openapi('EvolutionProposalsResponse');

export const EvolutionReviewResponseSchema = z
  .object({
    status: z.string(),
    id: z.string().optional(),
  })
  .openapi('EvolutionReviewResponse');

export const FieldStatSchema = z.object({
  categoryId: z.string(),
  fieldName: z.string(),
  timesAsked: z.number(),
  timesAnswered: z.number(),
  answerRate: z.number(),
  lastUpdatedAt: z.string(),
});

export const EvolutionStatsResponseSchema = z
  .object({
    domainSchemaId: z.string(),
    stats: z.array(FieldStatSchema),
  })
  .openapi('EvolutionStatsResponse');
