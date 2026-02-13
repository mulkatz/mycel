import { FieldValue, Timestamp } from '@google-cloud/firestore';
import type { FirestoreBase } from './firestore-types.js';
import { getFirestoreClient } from './firestore-types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';
import { resolveBehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import type {
  CreateDomainSchemaInput,
  CreatePersonaSchemaInput,
  UpdatePersonaSchemaInput,
  DomainSchemaOrigin,
  PersistedDomainSchema,
  PersistedPersonaSchema,
  SchemaRepository,
} from '../repositories/schema.repository.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';

const DOMAIN_SCHEMAS_COLLECTION = 'domainSchemas';
const PERSONA_SCHEMAS_COLLECTION = 'personaSchemas';

interface DomainSchemaDocument {
  name: string;
  version: number;
  config: Record<string, unknown>;
  behavior?: Record<string, unknown>;
  origin?: string;
  generatedFrom?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface PersonaSchemaDocument {
  name: string;
  description?: string;
  version: number;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function domainSchemaFromDoc(id: string, data: DomainSchemaDocument): PersistedDomainSchema {
  return {
    id,
    name: data.name,
    version: data.version,
    config: data.config as unknown as DomainConfig,
    behavior: data.behavior
      ? (data.behavior as unknown as DomainBehaviorConfig)
      : resolveBehaviorPreset('manual'),
    origin: data.origin ? (data.origin as DomainSchemaOrigin) : 'manual',
    generatedFrom: data.generatedFrom,
    isActive: data.isActive,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

function personaSchemaFromDoc(id: string, data: PersonaSchemaDocument): PersistedPersonaSchema {
  return {
    id,
    name: data.name,
    description: data.description,
    version: data.version,
    config: data.config as unknown as PersonaConfig,
    isActive: data.isActive,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

export function createFirestoreSchemaRepository(base: FirestoreBase): SchemaRepository {
  const db = getFirestoreClient(base);
  const domainRef = base.collection(DOMAIN_SCHEMAS_COLLECTION);
  const personaRef = base.collection(PERSONA_SCHEMAS_COLLECTION);

  return {
    async getDomainSchema(id: string): Promise<PersistedDomainSchema | null> {
      const doc = await domainRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return domainSchemaFromDoc(id, doc.data() as DomainSchemaDocument);
    },

    async getDomainSchemaByName(name: string): Promise<PersistedDomainSchema | null> {
      const snapshot = await domainRef.where('name', '==', name).limit(1).get();

      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return domainSchemaFromDoc(doc.id, doc.data() as DomainSchemaDocument);
    },

    async getActiveDomainSchema(): Promise<PersistedDomainSchema | null> {
      const snapshot = await domainRef.where('isActive', '==', true).limit(1).get();

      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return domainSchemaFromDoc(doc.id, doc.data() as DomainSchemaDocument);
    },

    async saveDomainSchema(input: CreateDomainSchemaInput): Promise<PersistedDomainSchema> {
      const now = Timestamp.now();
      const behavior = input.behavior ?? resolveBehaviorPreset('manual');
      const docData: DomainSchemaDocument = {
        name: input.name,
        version: input.version,
        config: input.config as unknown as Record<string, unknown>,
        behavior: behavior as unknown as Record<string, unknown>,
        origin: input.origin ?? 'manual',
        generatedFrom: input.generatedFrom,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = domainRef.doc();

      if (input.isActive) {
        // Use a transaction to atomically deactivate same-name schemas and create the new one
        await db.runTransaction(async (tx) => {
          const activeSnapshot = await tx.get(
            domainRef.where('name', '==', input.name).where('isActive', '==', true),
          );
          for (const doc of activeSnapshot.docs) {
            tx.update(doc.ref, { isActive: false, updatedAt: now });
          }
          tx.set(docRef, docData);
        });
      } else {
        await docRef.set(docData);
      }

      return domainSchemaFromDoc(docRef.id, docData);
    },

    async getPersonaSchema(id: string): Promise<PersistedPersonaSchema | null> {
      const doc = await personaRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return personaSchemaFromDoc(id, doc.data() as PersonaSchemaDocument);
    },

    async getPersonaSchemaByName(name: string): Promise<PersistedPersonaSchema | null> {
      const snapshot = await personaRef.where('name', '==', name).limit(1).get();

      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return personaSchemaFromDoc(doc.id, doc.data() as PersonaSchemaDocument);
    },

    async getActivePersonaSchema(): Promise<PersistedPersonaSchema | null> {
      const snapshot = await personaRef.where('isActive', '==', true).limit(1).get();

      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return personaSchemaFromDoc(doc.id, doc.data() as PersonaSchemaDocument);
    },

    async savePersonaSchema(input: CreatePersonaSchemaInput): Promise<PersistedPersonaSchema> {
      const now = Timestamp.now();
      const docData: PersonaSchemaDocument = {
        name: input.name,
        description: input.description,
        version: input.version,
        config: input.config as unknown as Record<string, unknown>,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = personaRef.doc();

      if (input.isActive) {
        await db.runTransaction(async (tx) => {
          const activeSnapshot = await tx.get(personaRef.where('isActive', '==', true));
          for (const doc of activeSnapshot.docs) {
            tx.update(doc.ref, { isActive: false, updatedAt: now });
          }
          tx.set(docRef, docData);
        });
      } else {
        await docRef.set(docData);
      }

      return personaSchemaFromDoc(docRef.id, docData);
    },

    async listDomainSchemas(filter?: { isActive?: boolean }): Promise<readonly PersistedDomainSchema[]> {
      let query = domainRef.orderBy('updatedAt', 'desc');
      if (filter?.isActive !== undefined) {
        query = domainRef.where('isActive', '==', filter.isActive).orderBy('updatedAt', 'desc');
      }
      const snapshot = await query.get();
      return snapshot.docs.map((doc) => domainSchemaFromDoc(doc.id, doc.data() as DomainSchemaDocument));
    },

    async listPersonaSchemas(): Promise<readonly PersistedPersonaSchema[]> {
      const snapshot = await personaRef.orderBy('updatedAt', 'desc').get();
      return snapshot.docs.map((doc) => personaSchemaFromDoc(doc.id, doc.data() as PersonaSchemaDocument));
    },

    async updatePersonaSchema(id: string, updates: UpdatePersonaSchemaInput): Promise<PersistedPersonaSchema> {
      const docRef = personaRef.doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new PersistenceError(`Persona schema not found: ${id}`);
      }

      const updateData: Record<string, unknown> = {
        version: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      };
      if (updates.name !== undefined) {
        updateData['name'] = updates.name;
      }
      if (updates.description !== undefined) {
        updateData['description'] = updates.description;
      }
      if (updates.config !== undefined) {
        updateData['config'] = updates.config as unknown as Record<string, unknown>;
      }
      if (updates.isActive !== undefined) {
        updateData['isActive'] = updates.isActive;
      }

      await docRef.update(updateData);

      const updated = await docRef.get();
      return personaSchemaFromDoc(id, updated.data() as PersonaSchemaDocument);
    },

    async deletePersonaSchema(id: string): Promise<void> {
      const docRef = personaRef.doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new PersistenceError(`Persona schema not found: ${id}`);
      }
      await docRef.delete();
    },
  };
}
