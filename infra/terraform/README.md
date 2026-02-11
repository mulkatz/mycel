# Mycel – Terraform Infrastructure

Terraform configuration for provisioning GCP resources used by Mycel.

## Directory Structure

```
infra/terraform/
├── modules/
│   ├── firestore/          # Firestore database + composite indexes
│   ├── artifact-registry/  # Docker image repository
│   ├── iam/                # Service accounts and role bindings
│   ├── cloud-run/          # Cloud Run service (not yet deployed)
│   ├── storage/            # Cloud Storage buckets (future use)
│   └── vertex-ai/          # Vertex AI Vector Search (future use)
├── environments/
│   └── dev/                # Dev environment composition
└── README.md
```

## Prerequisites

1. **GCP CLI** authenticated:
   ```bash
   gcloud auth application-default login
   ```

2. **Terraform** >= 1.5.0 installed

## Bootstrap (one-time setup)

The Terraform state bucket must be created manually before first use:

```bash
# Create the state bucket
gcloud storage buckets create gs://mycel-terraform-state-1348 \
  --location=europe-west3 \
  --uniform-bucket-level-access

# Enable versioning for state protection
gcloud storage buckets update gs://mycel-terraform-state-1348 \
  --versioning
```

## Usage

### 1. Configure Environment

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars if needed (defaults match mycel-dev-1348)
```

### 2. Initialize

```bash
terraform init
```

### 3. Import Existing Resources

The Firestore database was created manually and must be imported into state:

```bash
terraform import module.firestore.google_firestore_database.main "(default)"
```

### 4. Plan and Apply

```bash
# Review what will be created/changed
terraform plan

# After import, plan should show only NEW resources:
# - Artifact Registry repository
# - IAM service account + role bindings
# - GCP API enablement
# - Firestore composite indexes
# And NO changes to the existing Firestore database.

terraform apply
```

## Verification

```bash
# Format check
terraform fmt -check -recursive ../../

# Validation
terraform validate

# State list (after apply)
terraform state list
```

## Modules

| Module              | Status      | Description                                      |
|---------------------|-------------|--------------------------------------------------|
| `firestore`         | Active      | Firestore database (imported) + composite indexes |
| `artifact-registry` | Active      | Docker repository for Cloud Run images            |
| `iam`               | Active      | Service account with minimal roles                |
| `cloud-run`         | Placeholder | Uncomment in dev/main.tf when API layer is ready  |
| `storage`           | Future      | Cloud Storage buckets (not referenced yet)         |
| `vertex-ai`         | Future      | Vertex AI Vector Search (not referenced yet)       |

## Environments

- **dev** (`mycel-dev-1348`): Development environment, currently the only active config.

To add staging/prod: create a new directory under `environments/` following the same pattern as `dev/`.

## Security

- Never commit `terraform.tfvars` – it is gitignored
- Use `terraform.tfvars.example` as a template
- No secrets are stored in Terraform configs – all sensitive values come from GCP
- Service accounts use minimum required roles (no `roles/editor` or `roles/owner`)
