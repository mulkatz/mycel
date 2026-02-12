import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const ClassifierResultSchema = z.object({
  categoryId: z.string(),
  subcategoryId: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  isTopicChange: z.boolean().optional(),
  reasoning: z.string().optional(),
  summary: z.string().optional(),
  suggestedCategoryLabel: z.string().optional(),
});

export type ClassifierResult = z.infer<typeof ClassifierResultSchema>;

export const ClassifierResultJsonSchema = zodToJsonSchema(ClassifierResultSchema, {
  name: 'ClassifierResult',
  $refStrategy: 'none',
});

export const GapReasoningResultSchema = z.object({
  gaps: z.array(
    z.object({
      field: z.string(),
      description: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    }),
  ),
  followUpQuestions: z.array(z.string()),
  reasoning: z.string().optional(),
});

export type GapReasoningResult = z.infer<typeof GapReasoningResultSchema>;

export const GapReasoningResultJsonSchema = zodToJsonSchema(GapReasoningResultSchema, {
  name: 'GapReasoningResult',
  $refStrategy: 'none',
});

export const PersonaResultSchema = z.object({
  response: z.string(),
  followUpQuestions: z.array(z.string()),
});

export type PersonaResult = z.infer<typeof PersonaResultSchema>;

export const PersonaResultJsonSchema = zodToJsonSchema(PersonaResultSchema, {
  name: 'PersonaResult',
  $refStrategy: 'none',
});

export const StructuredEntrySchema = z.object({
  title: z.string(),
  content: z.string(),
  structuredData: z.record(z.unknown()),
  tags: z.array(z.string()),
  isComplete: z.boolean(),
  missingFields: z.array(z.string()),
});

export type StructuredEntry = z.infer<typeof StructuredEntrySchema>;

export const StructuredEntryJsonSchema = zodToJsonSchema(StructuredEntrySchema, {
  name: 'StructuredEntry',
  $refStrategy: 'none',
});
