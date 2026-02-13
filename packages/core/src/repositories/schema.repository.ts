import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';

export type DomainSchemaOrigin = 'manual' | 'web_research' | 'hybrid';

export interface PersistedDomainSchema {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly config: DomainConfig;
  readonly behavior: DomainBehaviorConfig;
  readonly origin: DomainSchemaOrigin;
  readonly generatedFrom?: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedPersonaSchema {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly version: number;
  readonly config: PersonaConfig;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDomainSchemaInput {
  readonly name: string;
  readonly version: number;
  readonly config: DomainConfig;
  readonly isActive: boolean;
  readonly behavior?: DomainBehaviorConfig;
  readonly origin?: DomainSchemaOrigin;
  readonly generatedFrom?: string;
}

export interface CreatePersonaSchemaInput {
  readonly name: string;
  readonly description?: string;
  readonly version: number;
  readonly config: PersonaConfig;
  readonly isActive: boolean;
}

export interface UpdatePersonaSchemaInput {
  readonly name?: string;
  readonly description?: string;
  readonly config?: PersonaConfig;
  readonly isActive?: boolean;
}

export interface SchemaRepository {
  getDomainSchema(id: string): Promise<PersistedDomainSchema | null>;
  getDomainSchemaByName(name: string): Promise<PersistedDomainSchema | null>;
  getActiveDomainSchema(): Promise<PersistedDomainSchema | null>;
  saveDomainSchema(input: CreateDomainSchemaInput): Promise<PersistedDomainSchema>;
  listDomainSchemas(filter?: { isActive?: boolean }): Promise<readonly PersistedDomainSchema[]>;
  getPersonaSchema(id: string): Promise<PersistedPersonaSchema | null>;
  getPersonaSchemaByName(name: string): Promise<PersistedPersonaSchema | null>;
  getActivePersonaSchema(): Promise<PersistedPersonaSchema | null>;
  savePersonaSchema(input: CreatePersonaSchemaInput): Promise<PersistedPersonaSchema>;
  listPersonaSchemas(): Promise<readonly PersistedPersonaSchema[]>;
  updatePersonaSchema(id: string, updates: UpdatePersonaSchemaInput): Promise<PersistedPersonaSchema>;
  deletePersonaSchema(id: string): Promise<void>;
}
