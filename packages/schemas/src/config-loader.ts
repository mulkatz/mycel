import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigurationError } from '@mycel/shared/src/utils/errors.js';
import { validateDomainConfig } from './validators.js';
import { validatePersonaConfig } from './validators.js';
import type { DomainConfig } from './domain.schema.js';
import type { PersonaConfig } from './persona.schema.js';

export interface AppConfig {
  readonly domain: DomainConfig;
  readonly persona: PersonaConfig;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigurationError(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw new ConfigurationError(`Configuration file not found: ${filePath}`);
    }
    throw new ConfigurationError(
      `Failed to read configuration file ${filePath}: ${nodeError.message}`,
    );
  }
}

export async function loadConfig(configDir: string): Promise<AppConfig> {
  const domainPath = join(configDir, 'domain.json');
  const personaPath = join(configDir, 'persona.json');

  const [domainRaw, personaRaw] = await Promise.all([
    readJsonFile(domainPath),
    readJsonFile(personaPath),
  ]);

  const domain = validateDomainConfig(domainRaw);
  const persona = validatePersonaConfig(personaRaw);

  return { domain, persona };
}
