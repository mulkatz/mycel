import type { Firestore } from '@google-cloud/firestore';
import { Timestamp } from '@google-cloud/firestore';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type {
  CreateDomainSchemaInput,
  CreatePersonaSchemaInput,
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

    async getActiveDomainSchema(): Promise<PersistedDomainSchema | null> {
      const snapshot = await domainRef
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return domainSchemaFromDoc(doc.id, doc.data() as DomainSchemaDocument);
    },

    async saveDomainSchema(input: CreateDomainSchemaInput): Promise<PersistedDomainSchema> {
      const now = Timestamp.now();

      if (input.isActive) {
        const activeSnapshot = await domainRef.where('isActive', '==', true).get();
        const batch = db.batch();
        for (const doc of activeSnapshot.docs) {
          batch.update(doc.ref, { isActive: false, updatedAt: now });
        }
        await batch.commit();
      }

      const docData: DomainSchemaDocument = {
        name: input.name,
        version: input.version,
        config: input.config as unknown as Record<string, unknown>,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = domainRef.doc();
      await docRef.set(docData);

      return domainSchemaFromDoc(docRef.id, docData);
    },

    async getPersonaSchema(id: string): Promise<PersistedPersonaSchema | null> {
      const doc = await personaRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return personaSchemaFromDoc(id, doc.data() as PersonaSchemaDocument);
    },

    async getActivePersonaSchema(): Promise<PersistedPersonaSchema | null> {
      const snapshot = await personaRef
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return personaSchemaFromDoc(doc.id, doc.data() as PersonaSchemaDocument);
    },

    async savePersonaSchema(input: CreatePersonaSchemaInput): Promise<PersistedPersonaSchema> {
      const now = Timestamp.now();

      if (input.isActive) {
        const activeSnapshot = await personaRef.where('isActive', '==', true).get();
        const batch = db.batch();
        for (const doc of activeSnapshot.docs) {
          batch.update(doc.ref, { isActive: false, updatedAt: now });
        }
        await batch.commit();
      }

      const docData: PersonaSchemaDocument = {
        name: input.name,
        version: input.version,
        config: input.config as unknown as Record<string, unknown>,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = personaRef.doc();
      await docRef.set(docData);

      return personaSchemaFromDoc(docRef.id, docData);
    },
  };
}
