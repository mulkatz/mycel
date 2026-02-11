import type { ZodError } from 'zod';
import { SchemaValidationError } from '@mycel/shared/src/utils/errors.js';
import { DomainSchema } from './domain.schema.js';
import type { DomainConfig } from './domain.schema.js';
import { PersonaSchema } from './persona.schema.js';
import type { PersonaConfig } from './persona.schema.js';

function formatZodErrors(error: ZodError): readonly string[] {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
}

export function validateDomainConfig(data: unknown): DomainConfig {
  const result = DomainSchema.safeParse(data);

  if (!result.success) {
    throw new SchemaValidationError('Invalid domain configuration', formatZodErrors(result.error));
  }

  return result.data;
}

export function validatePersonaConfig(data: unknown): PersonaConfig {
  const result = PersonaSchema.safeParse(data);

  if (!result.success) {
    throw new SchemaValidationError('Invalid persona configuration', formatZodErrors(result.error));
  }

  return result.data;
}
