# Plan 006 – Terraform Dev Environment Deployment

## Summary

Restructure the existing `infrastructure/` directory to match the task spec, provision the GCP dev environment, and import existing resources (Firestore database). The existing speculative modules (storage, vertex-ai) are kept as files but not referenced from the dev environment.

## Current State

- `infrastructure/` exists with root-level `backend.tf` and `providers.tf`
- Modules: `cloud-run/`, `storage/`, `vertex-ai/` (speculative, not matching task)
- Environments: `dev/` and `prod/` (minimal, reference storage + vertex-ai)
- No Firestore module, no IAM module, no Artifact Registry module
- Backend bucket name: `mycel-terraform-state` (task wants `mycel-terraform-state-1348`)
- Region defaults to `europe-west1` (task wants `europe-west3`)
- Root-level backend.tf/providers.tf are shared – but task spec puts these per-environment

## Target State

```
infra/
└── terraform/
    ├── modules/
    │   ├── firestore/          # NEW
    │   ├── cloud-run/          # RESTRUCTURED (placeholder, not deployed)
    │   ├── artifact-registry/  # NEW
    │   └── iam/                # NEW
    ├── environments/
    │   └── dev/
    │       ├── main.tf
    │       ├── variables.tf
    │       ├── terraform.tfvars  (gitignored)
    │       ├── terraform.tfvars.example
    │       ├── outputs.tf
    │       ├── providers.tf
    │       └── versions.tf
    └── README.md
```

## Key Decision: `infrastructure/` → `infra/terraform/`

The task spec uses `infra/terraform/`. The existing directory is `infrastructure/`. Per the spec we rename to `infra/terraform/`. The old speculative modules (`storage/`, `vertex-ai/`) are kept under `infra/terraform/modules/` as files but NOT referenced from `dev/main.tf`.

## Implementation Steps

### Step 1: Restructure directory

1. Move `infrastructure/` → `infra/terraform/`
2. Remove root-level `backend.tf` and `providers.tf` (will be per-environment)
3. Remove `environments/prod/` (out of scope, can be added later)
4. Keep `modules/storage/` and `modules/vertex-ai/` as-is (not referenced, but preserved)

### Step 2: Create `modules/firestore/`

**`modules/firestore/main.tf`**
- `google_firestore_database.main` — existing `(default)` database, will be imported
  - location_id = var.region, type = FIRESTORE_NATIVE
- `google_firestore_index` resources for the 4 composite indexes from `firestore.indexes.json`:
  1. `knowledgeEntries`: `categoryId` ASC + `createdAt` DESC
  2. `knowledgeEntries`: `categoryId` ASC + `status` ASC + `createdAt` DESC
  3. `knowledgeEntries`: `status` ASC + `createdAt` DESC
  4. `knowledgeEntries`: `sessionId` ASC + `createdAt` ASC

**`modules/firestore/variables.tf`** — project_id, region, database_id (default: "(default)")

**`modules/firestore/outputs.tf`** — database name/id

### Step 3: Create `modules/artifact-registry/`

**`modules/artifact-registry/main.tf`**
- `google_artifact_registry_repository.mycel` — Docker format, in var.region

**`modules/artifact-registry/variables.tf`** — project_id, region, repository_id

**`modules/artifact-registry/outputs.tf`** — repository URL

### Step 4: Create `modules/iam/`

**`modules/iam/main.tf`**
- `google_service_account.cloud_run` — account_id = "mycel-api"
- `google_project_iam_member` for:
  - `roles/datastore.user`
  - `roles/logging.logWriter`

**`modules/iam/variables.tf`** — project_id

**`modules/iam/outputs.tf`** — service account email

### Step 5: Restructure `modules/cloud-run/`

Keep the existing module but adapt it for the task spec:
- Max instances: parameterized (dev=2, prod=10)
- Add `service_account` parameter to link IAM service account
- Entire resource block commented out with note: "Uncomment when API layer container is available"
- Environment variables include `MYCEL_GCP_PROJECT_ID` and `FIRESTORE_DATABASE`

### Step 6: Create `environments/dev/` files

**`providers.tf`** — Google provider config + GCS backend (bucket: `mycel-terraform-state-1348`, prefix: `dev`)

**`versions.tf`** — required_version >= 1.5.0, google provider ~> 5.0

**`variables.tf`** — project_id, region (default europe-west3), environment

**`terraform.tfvars.example`** — template with mycel-dev-1348 values

**`main.tf`** — Composes modules:
1. Enable required GCP APIs via `google_project_service`
2. `module.firestore` — Firestore database + indexes
3. `module.artifact_registry` — Docker repo
4. `module.iam` — Service account + roles
5. Cloud Run module commented out

**`outputs.tf`** — Key outputs (Firestore DB, AR repo URL, SA email)

### Step 7: Write README.md

- Bootstrap instructions (state bucket creation)
- Import commands (Firestore database)
- Usage (init, plan, apply)
- Module descriptions

### Step 8: Verify

- `terraform fmt -check -recursive`
- `terraform validate` (requires init with backend, so document as verification step)

## File Inventory

Files to **create** (new):
- `infra/terraform/modules/firestore/main.tf`
- `infra/terraform/modules/firestore/variables.tf`
- `infra/terraform/modules/firestore/outputs.tf`
- `infra/terraform/modules/artifact-registry/main.tf`
- `infra/terraform/modules/artifact-registry/variables.tf`
- `infra/terraform/modules/artifact-registry/outputs.tf`
- `infra/terraform/modules/iam/main.tf`
- `infra/terraform/modules/iam/variables.tf`
- `infra/terraform/modules/iam/outputs.tf`
- `infra/terraform/environments/dev/providers.tf`
- `infra/terraform/environments/dev/versions.tf`
- `infra/terraform/environments/dev/outputs.tf`

Files to **rewrite** (move + restructure):
- `infra/terraform/environments/dev/main.tf`
- `infra/terraform/environments/dev/variables.tf`
- `infra/terraform/environments/dev/terraform.tfvars.example`
- `infra/terraform/modules/cloud-run/main.tf`
- `infra/terraform/README.md`

Files to **delete** (after moving):
- `infrastructure/backend.tf`
- `infrastructure/providers.tf`
- `infrastructure/README.md`
- `infrastructure/environments/prod/` (entire directory)
- `infrastructure/environments/dev/` (entire directory, replaced by new location)
- `infrastructure/modules/` (entire directory, replaced by new location)

## Notes

- The task says to keep speculative modules as files but not reference them. Storage and Vertex AI modules stay under `modules/` but aren't used in `dev/main.tf`.
- `terraform.tfvars` is gitignored — only `.example` is committed.
- The Cloud Run module is structurally complete but commented out in `dev/main.tf`.
- No VPC, monitoring, domain mapping, or Cloud Storage for user data.
