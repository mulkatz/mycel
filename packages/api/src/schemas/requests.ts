import { z } from '@hono/zod-openapi';

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
