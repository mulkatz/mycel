import { randomUUID } from 'node:crypto';
import type {
  CreateDomainSchemaInput,
  CreatePersonaSchemaInput,
  PersistedDomainSchema,
  PersistedPersonaSchema,
  SchemaRepository,
} from './schema.repository.js';

export function createInMemorySchemaRepository(): SchemaRepository {
  const domainSchemas = new Map<string, PersistedDomainSchema>();
  const personaSchemas = new Map<string, PersistedPersonaSchema>();

  return {
    getDomainSchema(id: string): Promise<PersistedDomainSchema | null> {
      return Promise.resolve(domainSchemas.get(id) ?? null);
    },

    getActiveDomainSchema(): Promise<PersistedDomainSchema | null> {
      for (const schema of domainSchemas.values()) {
        if (schema.isActive) {
          return Promise.resolve(schema);
        }
      }
      return Promise.resolve(null);
    },

    saveDomainSchema(input: CreateDomainSchemaInput): Promise<PersistedDomainSchema> {
      if (input.isActive) {
        for (const [id, schema] of domainSchemas) {
          if (schema.isActive) {
            domainSchemas.set(id, { ...schema, isActive: false, updatedAt: new Date() });
          }
        }
      }

      const now = new Date();
      const persisted: PersistedDomainSchema = {
        id: randomUUID(),
        name: input.name,
        version: input.version,
        config: input.config,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };
      domainSchemas.set(persisted.id, persisted);
      return Promise.resolve(persisted);
    },

    getPersonaSchema(id: string): Promise<PersistedPersonaSchema | null> {
      return Promise.resolve(personaSchemas.get(id) ?? null);
    },

    getActivePersonaSchema(): Promise<PersistedPersonaSchema | null> {
      for (const schema of personaSchemas.values()) {
        if (schema.isActive) {
          return Promise.resolve(schema);
        }
      }
      return Promise.resolve(null);
    },

    savePersonaSchema(input: CreatePersonaSchemaInput): Promise<PersistedPersonaSchema> {
      if (input.isActive) {
        for (const [id, schema] of personaSchemas) {
          if (schema.isActive) {
            personaSchemas.set(id, { ...schema, isActive: false, updatedAt: new Date() });
          }
        }
      }

      const now = new Date();
      const persisted: PersistedPersonaSchema = {
        id: randomUUID(),
        name: input.name,
        version: input.version,
        config: input.config,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };
      personaSchemas.set(persisted.id, persisted);
      return Promise.resolve(persisted);
    },
  };
}
