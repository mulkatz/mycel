import { z } from '@hono/zod-openapi';
import { PersonaSchema } from '@mycel/schemas/src/persona.schema.js';

export const CreateSessionSchema = z
  .object({
    domainSchemaId: z.string().min(1),
    personaSchemaId: z.string().min(1),
    metadata: z
      .object({
        source: z.string().optional(),
      })
      .optional(),
  })
  .openapi('CreateSessionRequest');

export type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;

export const CreateTurnSchema = z
  .object({
    userInput: z.string().min(1),
  })
  .openapi('CreateTurnRequest');

export type CreateTurnRequest = z.infer<typeof CreateTurnSchema>;

export const ListSessionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(['active', 'complete', 'abandoned']).optional(),
  })
  .openapi('ListSessionsQuery');

// Domains
export const ListDomainsQuerySchema = z
  .object({
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .openapi('ListDomainsQuery');

// Schema Proposals
export const ListProposalsQuerySchema = z
  .object({
    status: z.string().optional(),
  })
  .openapi('ListProposalsQuery');

// Entries
export const ListEntriesQuerySchema = z
  .object({
    category: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .openapi('ListEntriesQuery');

// Personas — reuse canonical PersonaSchema from @mycel/schemas to avoid drift
const PersonaConfigRequestSchema = PersonaSchema.omit({ $schema: true });

export const CreatePersonaRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    config: PersonaConfigRequestSchema,
  })
  .openapi('CreatePersonaRequest');

export type CreatePersonaRequest = z.infer<typeof CreatePersonaRequestSchema>;

export const UpdatePersonaRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    config: PersonaConfigRequestSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdatePersonaRequest');

export type UpdatePersonaRequest = z.infer<typeof UpdatePersonaRequestSchema>;
