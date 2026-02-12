import type { Firestore } from '@google-cloud/firestore';
import { Timestamp } from '@google-cloud/firestore';
import type { EvolutionProposal } from '@mycel/shared/src/types/evolution.types.js';
import { PersistenceError } from '@mycel/shared/src/utils/errors.js';
import type {
  CreateEvolutionProposalInput,
  EvolutionProposalRepository,
  UpdateEvolutionProposalInput,
} from '../repositories/evolution-proposal.repository.js';

const COLLECTION = 'evolution-proposals';

interface EvolutionProposalDocument {
  domainSchemaId: string;
  type: string;
  description: string;
  evidence: string[];
  confidence: number;
  status: string;
  newCategory?: Record<string, unknown>;
  newField?: Record<string, unknown>;
  changePriority?: Record<string, unknown>;
  clusterMetadata?: Record<string, unknown>;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  appliedAt?: Timestamp;
}

function proposalFromDoc(id: string, data: EvolutionProposalDocument): EvolutionProposal {
  return {
    id,
    domainSchemaId: data.domainSchemaId,
    type: data.type as EvolutionProposal['type'],
    description: data.description,
    evidence: data.evidence,
    confidence: data.confidence,
    status: data.status as EvolutionProposal['status'],
    newCategory: data.newCategory as EvolutionProposal['newCategory'],
    newField: data.newField as EvolutionProposal['newField'],
    changePriority: data.changePriority as EvolutionProposal['changePriority'],
    clusterMetadata: data.clusterMetadata as EvolutionProposal['clusterMetadata'],
    createdAt: data.createdAt.toDate(),
    reviewedAt: data.reviewedAt?.toDate(),
    appliedAt: data.appliedAt?.toDate(),
  };
}

export function createFirestoreEvolutionProposalRepository(
  db: Firestore,
): EvolutionProposalRepository {
  const collectionRef = db.collection(COLLECTION);

  return {
    async create(input: CreateEvolutionProposalInput): Promise<EvolutionProposal> {
      const now = Timestamp.now();

      const docData: EvolutionProposalDocument = {
        domainSchemaId: input.domainSchemaId,
        type: input.type,
        description: input.description,
        evidence: [...input.evidence],
        confidence: input.confidence,
        status: 'pending',
        newCategory: input.newCategory as unknown as Record<string, unknown>,
        newField: input.newField as unknown as Record<string, unknown>,
        changePriority: input.changePriority as unknown as Record<string, unknown>,
        clusterMetadata: input.clusterMetadata as unknown as Record<string, unknown>,
        createdAt: now,
      };

      const docRef = collectionRef.doc();
      await docRef.set(docData);

      return proposalFromDoc(docRef.id, docData);
    },

    async getById(id: string): Promise<EvolutionProposal | null> {
      const doc = await collectionRef.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return proposalFromDoc(id, doc.data() as EvolutionProposalDocument);
    },

    async getPendingByDomain(domainSchemaId: string): Promise<readonly EvolutionProposal[]> {
      const snapshot = await collectionRef
        .where('domainSchemaId', '==', domainSchemaId)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) =>
        proposalFromDoc(doc.id, doc.data() as EvolutionProposalDocument),
      );
    },

    async getByDomain(domainSchemaId: string): Promise<readonly EvolutionProposal[]> {
      const snapshot = await collectionRef
        .where('domainSchemaId', '==', domainSchemaId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) =>
        proposalFromDoc(doc.id, doc.data() as EvolutionProposalDocument),
      );
    },

    async update(id: string, updates: UpdateEvolutionProposalInput): Promise<void> {
      const doc = await collectionRef.doc(id).get();
      if (!doc.exists) {
        throw new PersistenceError(`Evolution proposal not found: ${id}`);
      }

      const updateData: Record<string, unknown> = {};

      if (updates.status !== undefined) {
        updateData['status'] = updates.status;
        updateData['reviewedAt'] = Timestamp.now();
      }
      if (updates.appliedAt !== undefined) {
        updateData['appliedAt'] = Timestamp.fromDate(updates.appliedAt);
      }

      await collectionRef.doc(id).update(updateData);
    },
  };
}
