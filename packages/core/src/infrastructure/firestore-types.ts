import type { Firestore, DocumentReference } from '@google-cloud/firestore';

/**
 * Base type for Firestore collection access.
 * - For tenant-scoped repos: pass `db.collection('tenants').doc(tenantId)` (DocumentReference)
 * - For global repos: pass `db` (Firestore)
 * Both have a `.collection()` method.
 */
export type FirestoreBase = Firestore | DocumentReference;

/**
 * Extracts the root Firestore client from a FirestoreBase.
 * Needed for operations like `runTransaction()` that only exist on Firestore.
 */
export function getFirestoreClient(base: FirestoreBase): Firestore {
  if ('runTransaction' in base) {
    return base;
  }
  return (base as DocumentReference).firestore;
}
