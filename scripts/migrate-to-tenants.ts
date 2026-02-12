/**
 * Migration script: moves existing flat Firestore data under tenants/{LEGACY_TENANT_ID}/
 *
 * Usage:
 *   npx tsx scripts/migrate-to-tenants.ts [--delete-originals]
 *
 * The script is idempotent — it skips documents that already exist at the target path.
 * Pass --delete-originals to remove source documents after successful copy.
 */

import { Firestore, Timestamp } from '@google-cloud/firestore';

const LEGACY_TENANT_ID = 'legacy-default';

const COLLECTIONS = [
  'sessions',
  'knowledgeEntries',
  'domainSchemas',
  'personaSchemas',
  'schema-proposals',
  'evolution-proposals',
  'field-stats',
  'generated-documents',
  'schema-evolution-log',
];

// search-cache stays global, not migrated

const SUBCOLLECTIONS: Record<string, string[]> = {
  sessions: ['turns'],
};

async function migrateCollection(
  db: Firestore,
  collectionName: string,
  deleteOriginals: boolean,
): Promise<{ copied: number; skipped: number }> {
  const sourceRef = db.collection(collectionName);
  const targetBase = db.collection('tenants').doc(LEGACY_TENANT_ID).collection(collectionName);

  const sourceDocs = await sourceRef.listDocuments();
  let copied = 0;
  let skipped = 0;

  for (const sourceDocRef of sourceDocs) {
    const targetDocRef = targetBase.doc(sourceDocRef.id);
    const targetDoc = await targetDocRef.get();

    if (targetDoc.exists) {
      skipped++;
    } else {
      const sourceDoc = await sourceDocRef.get();
      if (!sourceDoc.exists) {
        continue;
      }

      await targetDocRef.set(sourceDoc.data()!);
      copied++;

      // Copy subcollections
      const subcollections = SUBCOLLECTIONS[collectionName] ?? [];
      for (const subName of subcollections) {
        const subDocs = await sourceDocRef.collection(subName).listDocuments();
        for (const subDocRef of subDocs) {
          const subData = await subDocRef.get();
          if (subData.exists) {
            const targetSubRef = targetDocRef.collection(subName).doc(subDocRef.id);
            const targetSub = await targetSubRef.get();
            if (!targetSub.exists) {
              await targetSubRef.set(subData.data()!);
            }
          }
        }
      }
    }

    if (deleteOriginals) {
      const subcollections = SUBCOLLECTIONS[collectionName] ?? [];
      for (const subName of subcollections) {
        const subDocs = await sourceDocRef.collection(subName).listDocuments();
        for (const subDocRef of subDocs) {
          await subDocRef.delete();
        }
      }
      await sourceDocRef.delete();
    }
  }

  return { copied, skipped };
}

async function main(): Promise<void> {
  const deleteOriginals = process.argv.includes('--delete-originals');
  const db = new Firestore();

  console.log(`Migrating data to tenants/${LEGACY_TENANT_ID}/`);
  console.log(`Delete originals: ${String(deleteOriginals)}`);
  console.log('---');

  for (const collection of COLLECTIONS) {
    const { copied, skipped } = await migrateCollection(db, collection, deleteOriginals);
    console.log(`${collection}: ${String(copied)} copied, ${String(skipped)} skipped`);
  }

  console.log('---');
  console.log('Migration complete.');
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
