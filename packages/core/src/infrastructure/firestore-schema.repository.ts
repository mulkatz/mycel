import type { Firestore } from '@google-cloud/firestore';
import { Timestamp } from '@google-cloud/firestore';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';
import { resolveBehaviorPreset } from '@mycel/schemas/src/domain-behavior.schema.js';
import type {
  CreateDomainSchemaInput,
  CreatePersonaSchemaInput,
  DomainSchemaOrigin,
  PersistedDomainSchema,
  PersistedPersonaSchema,
  SchemaRepository,
} from '../repositories/schema.repository.js';

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
    version: data.version,
    config: data.config as unknown as PersonaConfig,
    isActive: data.isActive,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

export function createFirestoreSchemaRepository(db: Firestore): SchemaRepository {
  const domainRef = db.collection(DOMAIN_SCHEMAS_COLLECTION);
  const personaRef = db.collection(PERSONA_SCHEMAS_COLLECTION);

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
        // Use a transaction to atomically deactivate existing schemas and create the new one
        await db.runTransaction(async (tx) => {
          const activeSnapshot = await tx.get(domainRef.where('isActive', '==', true));
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
  };
}
