locals {
  required_apis = [
    "firestore.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "aiplatform.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "firestore" {
  source = "../../modules/firestore"

  project_id = var.project_id
  region     = var.region

  depends_on = [google_project_service.apis]
}

module "artifact_registry" {
  source = "../../modules/artifact-registry"

  project_id = var.project_id
  region     = var.region

  depends_on = [google_project_service.apis]
}

module "iam" {
  source = "../../modules/iam"

  project_id = var.project_id

  depends_on = [google_project_service.apis]
}

# Uncomment when API layer container is available
# module "cloud_run" {
#   source = "../../modules/cloud-run"
#
#   project_id            = var.project_id
#   region                = var.region
#   image                 = "${module.artifact_registry.repository_url}/api:latest"
#   service_account_email = module.iam.cloud_run_service_account_email
#   max_instance_count    = 2
#
#   environment_variables = {
#     MYCEL_GCP_PROJECT_ID = var.project_id
#     FIRESTORE_DATABASE   = module.firestore.database_name
#   }
#
#   depends_on = [google_project_service.apis]
# }
