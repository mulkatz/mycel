import type { Firestore } from '@google-cloud/firestore';
import type { EvolutionProposal } from '@mycel/shared/src/types/evolution.types.js';
import type { DomainConfig, Category } from '@mycel/schemas/src/domain.schema.js';
import type { SchemaRepository, PersistedDomainSchema } from '../../repositories/schema.repository.js';
import type { KnowledgeRepository } from '../../repositories/knowledge.repository.js';
import type { EvolutionProposalRepository } from '../../repositories/evolution-proposal.repository.js';
import { SchemaGenerationError } from '@mycel/shared/src/utils/errors.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('schema-evolution:applier');

const EVOLUTION_LOG_COLLECTION = 'schema-evolution-log';

export interface EvolutionApplierDeps {
  readonly schemaRepository: SchemaRepository;
  readonly knowledgeRepository: KnowledgeRepository;
  readonly proposalRepository: EvolutionProposalRepository;
  readonly firestoreClient?: Firestore;
}

interface EvolutionLogEntry {
  readonly proposalId: string;
  readonly domainSchemaId: string;
  readonly type: string;
  readonly description: string;
  readonly autoApplied: boolean;
  readonly appliedAt: Date;
  readonly previousVersion: number;
  readonly newVersion: number;
}

async function logEvolution(
  firestoreClient: Firestore | undefined,
  entry: EvolutionLogEntry,
): Promise<void> {
  if (!firestoreClient) {
    log.info({ ...entry }, 'Evolution applied (no Firestore client for audit log)');
    return;
  }

  try {
    await firestoreClient.collection(EVOLUTION_LOG_COLLECTION).add({
      ...entry,
      appliedAt: entry.appliedAt,
    });
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to write evolution audit log',
    );
  }
}

function parseVersion(version: string): number {
  const parts = version.split('.');
  return parseInt(parts[2] ?? '0', 10);
}

function incrementVersion(version: string): string {
  const parts = version.split('.');
  const patch = parseInt(parts[2] ?? '0', 10) + 1;
  return `${parts[0]}.${parts[1]}.${String(patch)}`;
}

export async function applyProposal(
  proposal: EvolutionProposal,
  currentSchema: PersistedDomainSchema,
  deps: EvolutionApplierDeps,
  autoApplied: boolean,
): Promise<string> {
  const { schemaRepository, knowledgeRepository, proposalRepository, firestoreClient } = deps;
  const config = currentSchema.config;
  const previousVersion = parseVersion(config.version);

  let newConfig: DomainConfig;

  switch (proposal.type) {
    case 'new_category': {
      if (!proposal.newCategory) {
        throw new SchemaGenerationError('new_category proposal missing newCategory data');
      }

      const newCategory: Category = {
        id: proposal.newCategory.id,
        label: proposal.newCategory.label,
        description: proposal.newCategory.description,
        optionalFields: [...proposal.newCategory.suggestedFields],
        origin: 'discovered',
      };

      newConfig = {
        ...config,
        version: incrementVersion(config.version),
        categories: [...config.categories, newCategory],
      };

      // Save new schema version
      const savedSchema = await schemaRepository.saveDomainSchema({
        name: currentSchema.name,
        version: currentSchema.version + 1,
        config: newConfig,
        behavior: currentSchema.behavior,
        origin: currentSchema.origin,
        isActive: true,
      });

      // Migrate matching entries
      for (const entryId of proposal.evidence) {
        try {
          await knowledgeRepository.update(entryId, {
            categoryId: proposal.newCategory.id,
            status: 'migrated',
            migratedFrom: '_uncategorized',
          });
        } catch (error) {
          log.warn(
            { entryId, error: error instanceof Error ? error.message : String(error) },
            'Failed to migrate entry',
          );
        }
      }

      // Update proposal status
      await proposalRepository.update(proposal.id, {
        status: autoApplied ? 'auto_applied' : 'approved',
        appliedAt: new Date(),
      });

      await logEvolution(firestoreClient, {
        proposalId: proposal.id,
        domainSchemaId: proposal.domainSchemaId,
        type: 'new_category',
        description: `Added category "${proposal.newCategory.label}"`,
        autoApplied,
        appliedAt: new Date(),
        previousVersion,
        newVersion: previousVersion + 1,
      });

      log.info(
        {
          proposalId: proposal.id,
          categoryId: proposal.newCategory.id,
          migratedEntries: proposal.evidence.length,
          newSchemaId: savedSchema.id,
        },
        'Applied new_category proposal',
      );

      return savedSchema.id;
    }

    case 'new_field': {
      if (!proposal.newField) {
        throw new SchemaGenerationError('new_field proposal missing newField data');
      }

      const newField = proposal.newField;
      if (!config.categories.some((cat) => cat.id === newField.targetCategoryId)) {
        throw new SchemaGenerationError(
          `Target category "${newField.targetCategoryId}" not found in schema`,
        );
      }

      const categories = config.categories.map((cat) => {
        if (cat.id !== newField.targetCategoryId) {
          return cat;
        }

        if (newField.fieldType === 'required') {
          return {
            ...cat,
            requiredFields: [...(cat.requiredFields ?? []), newField.fieldName],
          };
        }
        return {
          ...cat,
          optionalFields: [...(cat.optionalFields ?? []), newField.fieldName],
        };
      });

      newConfig = {
        ...config,
        version: incrementVersion(config.version),
        categories,
      };

      const savedSchema = await schemaRepository.saveDomainSchema({
        name: currentSchema.name,
        version: currentSchema.version + 1,
        config: newConfig,
        behavior: currentSchema.behavior,
        origin: currentSchema.origin,
        isActive: true,
      });

      await proposalRepository.update(proposal.id, {
        status: autoApplied ? 'auto_applied' : 'approved',
        appliedAt: new Date(),
      });

      await logEvolution(firestoreClient, {
        proposalId: proposal.id,
        domainSchemaId: proposal.domainSchemaId,
        type: 'new_field',
        description: `Added ${proposal.newField.fieldType} field "${proposal.newField.fieldName}" to "${proposal.newField.targetCategoryId}"`,
        autoApplied,
        appliedAt: new Date(),
        previousVersion,
        newVersion: previousVersion + 1,
      });

      log.info(
        { proposalId: proposal.id, field: proposal.newField.fieldName },
        'Applied new_field proposal',
      );

      return savedSchema.id;
    }

    case 'change_priority': {
      if (!proposal.changePriority) {
        throw new SchemaGenerationError('change_priority proposal missing changePriority data');
      }

      const changePriority = proposal.changePriority;
      if (!config.categories.some((cat) => cat.id === changePriority.targetCategoryId)) {
        throw new SchemaGenerationError(
          `Target category "${changePriority.targetCategoryId}" not found in schema`,
        );
      }

      const categories = config.categories.map((cat) => {
        if (cat.id !== changePriority.targetCategoryId) {
          return cat;
        }

        const field = changePriority.fieldName;
        const required = (cat.requiredFields ?? []).filter((f) => f !== field);
        const optional = [...(cat.optionalFields ?? [])];
        if (!optional.includes(field)) {
          optional.push(field);
        }

        return { ...cat, requiredFields: required, optionalFields: optional };
      });

      newConfig = {
        ...config,
        version: incrementVersion(config.version),
        categories,
      };

      const savedSchema = await schemaRepository.saveDomainSchema({
        name: currentSchema.name,
        version: currentSchema.version + 1,
        config: newConfig,
        behavior: currentSchema.behavior,
        origin: currentSchema.origin,
        isActive: true,
      });

      await proposalRepository.update(proposal.id, {
        status: autoApplied ? 'auto_applied' : 'approved',
        appliedAt: new Date(),
      });

      await logEvolution(firestoreClient, {
        proposalId: proposal.id,
        domainSchemaId: proposal.domainSchemaId,
        type: 'change_priority',
        description: `Moved field "${proposal.changePriority.fieldName}" from required to optional in "${proposal.changePriority.targetCategoryId}"`,
        autoApplied,
        appliedAt: new Date(),
        previousVersion,
        newVersion: previousVersion + 1,
      });

      log.info(
        { proposalId: proposal.id, field: proposal.changePriority.fieldName },
        'Applied change_priority proposal',
      );

      return savedSchema.id;
    }

    default:
      throw new SchemaGenerationError(`Unknown proposal type: ${String(proposal.type)}`);
  }
}
