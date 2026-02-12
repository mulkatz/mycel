import { resolve } from 'node:path';
import { loadConfig } from '@mycel/schemas/src/config-loader.js';
import { createFirestoreClient } from '@mycel/core/src/infrastructure/firestore-client.js';
import { createFirestoreSchemaRepository } from '@mycel/core/src/infrastructure/firestore-schema.repository.js';

async function main(): Promise<void> {
  const tenantIdFlag = process.argv.find((a) => a.startsWith('--tenant-id='));
  const tenantId = tenantIdFlag?.split('=')[1];
  const positionalArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const configDir = positionalArgs.length > 0 ? positionalArgs[0] : resolve(process.cwd(), 'config');

  console.log('=== Mycel Schema Seeder ===\n');
  console.log(`Config directory: ${configDir}`);
  console.log(`Tenant: ${tenantId ?? '(root — legacy mode)'}`);
  console.log(`Firestore emulator: ${process.env['FIRESTORE_EMULATOR_HOST'] ?? 'not set (using real Firestore)'}\n`);

  const appConfig = await loadConfig(configDir);
  const db = createFirestoreClient();
  const base = tenantId ? db.collection('tenants').doc(tenantId) : db;
  const schemaRepo = createFirestoreSchemaRepository(base);

  // Check for existing active schemas
  const existingDomain = await schemaRepo.getActiveDomainSchema();
  if (existingDomain && existingDomain.config.name === appConfig.domain.name && existingDomain.config.version === appConfig.domain.version) {
    console.log(`Domain schema "${appConfig.domain.name}" v${appConfig.domain.version} already exists and is active. Skipping.`);
  } else {
    const domain = await schemaRepo.saveDomainSchema({
      name: appConfig.domain.name,
      version: 1,
      config: appConfig.domain,
      isActive: true,
    });
    console.log(`Domain schema saved: "${domain.name}" (id: ${domain.id})`);
  }

  const existingPersona = await schemaRepo.getActivePersonaSchema();
  if (existingPersona && existingPersona.config.name === appConfig.persona.name && existingPersona.config.version === appConfig.persona.version) {
    console.log(`Persona schema "${appConfig.persona.name}" v${appConfig.persona.version} already exists and is active. Skipping.`);
  } else {
    const persona = await schemaRepo.savePersonaSchema({
      name: appConfig.persona.name,
      version: 1,
      config: appConfig.persona,
      isActive: true,
    });
    console.log(`Persona schema saved: "${persona.name}" (id: ${persona.id})`);
  }

  console.log('\nSeeding complete.');
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
