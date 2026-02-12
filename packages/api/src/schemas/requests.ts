import { z } from 'zod';

export const CreateSessionSchema = z.object({
  domainSchemaId: z.string().min(1),
  personaSchemaId: z.string().min(1),
  metadata: z
    .object({
      source: z.string().optional(),
    })
    .optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;

export const CreateTurnSchema = z.object({
  userInput: z.string().min(1),
});

export type CreateTurnRequest = z.infer<typeof CreateTurnSchema>;
