import { randomUUID } from 'node:crypto';
import { resolveBehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateDomainSchemaInput,
  CreatePersonaSchemaInput,
  UpdatePersonaSchemaInput,
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

    getDomainSchemaByName(name: string): Promise<PersistedDomainSchema | null> {
      let found: PersistedDomainSchema | null = null;
      for (const schema of domainSchemas.values()) {
        if (schema.name === name) {
          if (!found || schema.isActive) {
            found = schema;
          }
        }
      }
      return Promise.resolve(found);
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
          if (schema.isActive && schema.name === input.name) {
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
        behavior: input.behavior ?? resolveBehaviorPreset('manual'),
        origin: input.origin ?? 'manual',
        generatedFrom: input.generatedFrom,
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

    getPersonaSchemaByName(name: string): Promise<PersistedPersonaSchema | null> {
      for (const schema of personaSchemas.values()) {
        if (schema.name === name) {
          return Promise.resolve(schema);
        }
      }
      return Promise.resolve(null);
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
        description: input.description,
        version: input.version,
        config: input.config,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };
      personaSchemas.set(persisted.id, persisted);
      return Promise.resolve(persisted);
    },

    listDomainSchemas(filter?: { isActive?: boolean }): Promise<readonly PersistedDomainSchema[]> {
      let results = [...domainSchemas.values()];
      if (filter?.isActive !== undefined) {
        results = results.filter((s) => s.isActive === filter.isActive);
      }
      results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return Promise.resolve(results);
    },

    listPersonaSchemas(): Promise<readonly PersistedPersonaSchema[]> {
      const results = [...personaSchemas.values()];
      results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return Promise.resolve(results);
    },

    updatePersonaSchema(id: string, updates: UpdatePersonaSchemaInput): Promise<PersistedPersonaSchema> {
      const existing = personaSchemas.get(id);
      if (!existing) {
        return Promise.reject(new PersistenceError(`Persona schema not found: ${id}`));
      }
      const updated: PersistedPersonaSchema = {
        ...existing,
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.config !== undefined && { config: updates.config }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
        version: existing.version + 1,
        updatedAt: new Date(),
      };
      personaSchemas.set(id, updated);
      return Promise.resolve(updated);
    },

    deletePersonaSchema(id: string): Promise<void> {
      if (!personaSchemas.has(id)) {
        return Promise.reject(new PersistenceError(`Persona schema not found: ${id}`));
      }
      personaSchemas.delete(id);
      return Promise.resolve();
    },
  };
}
