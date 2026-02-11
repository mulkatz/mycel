# Mycel – Infrastructure

Terraform configuration for provisioning GCP resources used by Mycel.

## Prerequisites

1. **GCP Project**: Create a GCP project and note the project ID
2. **Enable APIs**:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     aiplatform.googleapis.com \
     storage.googleapis.com \
     cloudbuild.googleapis.com
   ```
3. **Authentication**:
   ```bash
   gcloud auth application-default login
   ```
4. **State Bucket**: Create the Terraform state bucket:
   ```bash
   gsutil mb -l europe-west1 gs://mycel-terraform-state
   ```

## Structure

```
infrastructure/
├── environments/
│   ├── dev/          # Development environment
│   └── prod/         # Production environment
├── modules/
│   ├── cloud-run/    # Cloud Run service module
│   ├── storage/      # Cloud Storage module
│   └── vertex-ai/    # Vertex AI resources module
├── backend.tf        # Remote state backend (GCS)
└── providers.tf      # Required providers
```

## Usage

### 1. Configure Environment

```bash
cd environments/dev
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 2. Initialize & Apply

```bash
terraform init
terraform plan
terraform apply
```

## Environments

- **dev**: Development environment with minimal resources
- **prod**: Production environment with full scaling

Never commit `terraform.tfvars` – it contains project-specific values. Use `terraform.tfvars.example` as a template.
