import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';

export interface PersistedDomainSchema {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly config: DomainConfig;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PersistedPersonaSchema {
  readonly id: string;
  readonly name: string;
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
}

export interface CreatePersonaSchemaInput {
  readonly name: string;
  readonly version: number;
  readonly config: PersonaConfig;
  readonly isActive: boolean;
}

export interface SchemaRepository {
  getDomainSchema(id: string): Promise<PersistedDomainSchema | null>;
  getDomainSchemaByName(name: string): Promise<PersistedDomainSchema | null>;
  getActiveDomainSchema(): Promise<PersistedDomainSchema | null>;
  saveDomainSchema(input: CreateDomainSchemaInput): Promise<PersistedDomainSchema>;
  getPersonaSchema(id: string): Promise<PersistedPersonaSchema | null>;
  getPersonaSchemaByName(name: string): Promise<PersistedPersonaSchema | null>;
  getActivePersonaSchema(): Promise<PersistedPersonaSchema | null>;
  savePersonaSchema(input: CreatePersonaSchemaInput): Promise<PersistedPersonaSchema>;
}
