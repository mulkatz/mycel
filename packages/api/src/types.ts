import type { TenantRepositories } from '@mycel/core/src/infrastructure/tenant-repositories.js';

export interface AppEnv {
  Variables: {
    requestId: string;
    tenantId: string;
    tenantRepos: TenantRepositories;
  };
}
