# Plan: Cloud Run Deployment

## Status: Done

## Goal

Deploy the existing Mycel API to Cloud Run so it's accessible over the internet.
Everything is already built — this task connects the pieces.

## Current State

- **Dockerfile** (`packages/api/Dockerfile`): Complete multi-stage Node 20 Alpine build.
  Builds all workspace packages, copies only `dist/` + `package.json` to production stage.
  Listens on `PORT` (default 8080).
- **Terraform Cloud Run module** (`infra/terraform/modules/cloud-run/`): Complete with
  scaling (0–2), env vars, service account. Uses `google_cloud_run_v2_service`.
- **Cloud Run module is commented out** in `infra/terraform/environments/dev/main.tf`.
- **IAM**: Service account `mycel-api` exists with `roles/datastore.user` and
  `roles/logging.logWriter`. **Missing: `roles/aiplatform.user`** for Vertex AI.
- **Artifact Registry**: Repository exists at
  `europe-west3-docker.pkg.dev/<your-project-id>/mycel`, currently empty.
- **No `.dockerignore`** file exists.
- **No deploy script** exists.
- **No public access policy** for Cloud Run (needed for dev/testing without auth).

## Implementation Steps

### Step 1: Add `.dockerignore`

Create `.dockerignore` at repo root to speed up Docker builds and reduce image size:

```
.git
node_modules
dist
*.md
docs/
infra/
scripts/
.env*
*.tfvars
.terraform
```

### Step 2: Verify Dockerfile builds locally

Build and test locally:

```bash
docker build -f packages/api/Dockerfile -t mycel-api .
docker run -p 3000:8080 -e PORT=8080 -e MYCEL_GCP_PROJECT_ID=<your-project-id> -e MYCEL_MOCK_LLM=true mycel-api
curl http://localhost:3000/health
```

Fix any build issues discovered. The Dockerfile looks correct based on review, but
needs a real build to confirm.

### Step 3: Add missing IAM role for Vertex AI

In `infra/terraform/modules/iam/main.tf`, add:

```hcl
resource "google_project_iam_member" "cloud_run_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}
```

### Step 4: Enhance Cloud Run module

The existing module is mostly good but needs:

1. **Port configuration** — add `ports { container_port = 8080 }` to the container block
2. **Startup probe** — Cloud Run needs time for cold starts:
   ```hcl
   startup_probe {
     http_get { path = "/health" }
     initial_delay_seconds = 0
     period_seconds        = 3
     failure_threshold     = 10
   }
   ```
3. **Request timeout** — 120s for the agent pipeline (5 LLM calls in series):
   ```hcl
   timeout = "120s"
   ```
4. **Resource limits** — reduce from 2 CPU / 1Gi to 1 CPU / 512Mi (sufficient for dev)

### Step 5: Add unauthenticated access for dev

Add a variable `allow_unauthenticated` (default `false`) to the Cloud Run module.
When true, create an IAM binding for `allUsers` with `roles/run.invoker`.

In `infra/terraform/modules/cloud-run/main.tf`:

```hcl
variable "allow_unauthenticated" {
  description = "Allow unauthenticated access to the service"
  type        = bool
  default     = false
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.mycel.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

Pass `allow_unauthenticated = true` from the dev environment.

### Step 6: Uncomment and configure Cloud Run module in dev

In `infra/terraform/environments/dev/main.tf`, uncomment the Cloud Run module block
and pass `allow_unauthenticated = true`.

Add a `cloud_run_service_url` output to the dev environment outputs.

### Step 7: Build, push, and deploy

Manual steps (will be automated in Step 8):

```bash
gcloud auth configure-docker europe-west3-docker.pkg.dev
docker build -f packages/api/Dockerfile -t europe-west3-docker.pkg.dev/<your-project-id>/mycel/api:latest .
docker push europe-west3-docker.pkg.dev/<your-project-id>/mycel/api:latest
cd infra/terraform/environments/dev && terraform apply
```

### Step 8: Create deploy script

Create `scripts/deploy.sh` that:
1. Builds the Docker image tagged with git SHA + `latest`
2. Pushes both tags to Artifact Registry
3. Updates the Cloud Run service with `gcloud run services update`

### Step 9: Smoke test

```bash
SERVICE_URL=$(gcloud run services describe mycel-api --region=europe-west3 --project=<your-project-id> --format='value(status.url)')
curl "$SERVICE_URL/health"
```

## Files Changed

| File | Action |
|------|--------|
| `.dockerignore` | Create |
| `packages/api/Dockerfile` | Fix if needed |
| `infra/terraform/modules/iam/main.tf` | Add `roles/aiplatform.user` |
| `infra/terraform/modules/cloud-run/main.tf` | Add port, probe, timeout, reduce resources |
| `infra/terraform/modules/cloud-run/variables.tf` | Add `allow_unauthenticated` variable |
| `infra/terraform/environments/dev/main.tf` | Uncomment Cloud Run module |
| `infra/terraform/environments/dev/outputs.tf` | Add Cloud Run URL output |
| `scripts/deploy.sh` | Create |

## Out of Scope

- Custom domain mapping
- CI/CD pipeline
- Authentication on endpoints
- Monitoring/alerting
- Changes to API endpoints or business logic
