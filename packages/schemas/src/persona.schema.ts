import { z } from 'zod';

const PromptBehaviorSchema = z.object({
  gapAnalysis: z.boolean(),
  maxFollowUpQuestions: z.number().int().min(0).max(10),
  encourageStorytelling: z.boolean(),
  validateWithSources: z.boolean(),
});

export const PersonaSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tonality: z.string().min(1),
  formality: z.enum(['formal', 'informal', 'neutral']),
  language: z.string().min(2).max(5),
  addressForm: z.string().optional(),
  promptBehavior: PromptBehaviorSchema,
  systemPromptTemplate: z.string().min(1),
});

export type PersonaConfig = z.infer<typeof PersonaSchema>;
export type PromptBehavior = z.infer<typeof PromptBehaviorSchema>;
