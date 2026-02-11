import { Firestore } from '@google-cloud/firestore';

export function createFirestoreClient(): Firestore {
  return new Firestore({
    projectId: process.env['MYCEL_GCP_PROJECT_ID'],
    ignoreUndefinedProperties: true,
  });
}
