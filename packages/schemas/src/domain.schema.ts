import { z } from 'zod';

const CategorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  requiredFields: z.array(z.string()).optional(),
  optionalFields: z.array(z.string()).optional(),
});

const IngestionConfigSchema = z.object({
  allowedModalities: z.array(z.enum(['audio', 'image', 'text'])).min(1),
  primaryLanguage: z.string().min(2).max(5),
  supportedLanguages: z.array(z.string().min(2).max(5)).min(1),
});

export const DomainSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),
  categories: z.array(CategorySchema).min(1),
  ingestion: IngestionConfigSchema,
});

export type DomainConfig = z.infer<typeof DomainSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type IngestionConfig = z.infer<typeof IngestionConfigSchema>;
