import { Timestamp } from '@google-cloud/firestore';
import type { FirestoreBase } from './firestore-types.js';
import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { DomainBehaviorConfig } from '@mycel/schemas/src/domain-behavior.schema.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateSchemaProposalInput,
  SchemaProposal,
  SchemaProposalRepository,
  UpdateSchemaProposalInput,
} from '../repositories/schema-proposal.repository.js';

const COLLECTION = 'schema-proposals';

interface ProposalDocument {
  description: string;
  language: string;
  status: string;
  proposedSchema: Record<string, unknown>;
  behavior: Record<string, unknown>;
  reasoning: string;
  sources: string[];
  feedback?: string;
  resultingDomainSchemaId?: string;
  failureReason?: string;
  failedAt?: Timestamp;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
}

function proposalFromDoc(id: string, data: ProposalDocument): SchemaProposal {
  return {
    id,
    description: data.description,
    language: data.language,
    status: data.status as SchemaProposal['status'],
    proposedSchema: data.proposedSchema as unknown as DomainConfig,
    behavior: data.behavior as unknown as DomainBehaviorConfig,
    reasoning: data.reasoning,
    sources: data.sources,
    feedback: data.feedback,
    resultingDomainSchemaId: data.resultingDomainSchemaId,
    failureReason: data.failureReason,
    failedAt: data.failedAt?.toDate(),
    createdAt: data.createdAt.toDate(),
    reviewedAt: data.reviewedAt?.toDate(),
  };
}

export function createFirestoreSchemaProposalRepository(base: FirestoreBase): SchemaProposalRepository {
  const collectionRef = base.collection(COLLECTION);

  return {
    async getProposal(id: string): Promise<SchemaProposal | null> {
      const doc = await collectionRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return proposalFromDoc(id, doc.data() as ProposalDocument);
    },

    async saveProposal(input: CreateSchemaProposalInput): Promise<SchemaProposal> {
      const now = Timestamp.now();

      const docData: ProposalDocument = {
        description: input.description,
        language: input.language,
        status: input.status ?? 'pending',
        proposedSchema: input.proposedSchema as unknown as Record<string, unknown>,
        behavior: input.behavior as unknown as Record<string, unknown>,
        reasoning: input.reasoning,
        sources: [...input.sources],
        createdAt: now,
      };

      const docRef = collectionRef.doc();
      await docRef.set(docData);

      return proposalFromDoc(docRef.id, docData);
    },

    async updateProposal(id: string, input: UpdateSchemaProposalInput): Promise<SchemaProposal> {
      const doc = await collectionRef.doc(id).get();
      if (!doc.exists) {
        throw new PersistenceError(`Schema proposal not found: ${id}`);
      }

      const updates: Record<string, unknown> = {};

      if (input.status !== undefined) {
        updates['status'] = input.status;
        if (input.status === 'approved' || input.status === 'rejected') {
          updates['reviewedAt'] = Timestamp.now();
        }
      }
      if (input.feedback !== undefined) {
        updates['feedback'] = input.feedback;
      }
      if (input.resultingDomainSchemaId !== undefined) {
        updates['resultingDomainSchemaId'] = input.resultingDomainSchemaId;
      }
      if (input.proposedSchema !== undefined) {
        updates['proposedSchema'] = input.proposedSchema as unknown as Record<string, unknown>;
      }
      if (input.behavior !== undefined) {
        updates['behavior'] = input.behavior as unknown as Record<string, unknown>;
      }
      if (input.reasoning !== undefined) {
        updates['reasoning'] = input.reasoning;
      }
      if (input.sources !== undefined) {
        updates['sources'] = [...input.sources];
      }
      if (input.failureReason !== undefined) {
        updates['failureReason'] = input.failureReason;
      }
      if (input.failedAt !== undefined) {
        updates['failedAt'] = Timestamp.fromDate(input.failedAt);
      }

      await collectionRef.doc(id).update(updates);

      const updatedDoc = await collectionRef.doc(id).get();
      return proposalFromDoc(id, updatedDoc.data() as ProposalDocument);
    },
  };
}
