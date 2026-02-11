module "storage" {
  source = "../../modules/storage"

  project_id         = var.project_id
  region             = var.region
  bucket_name_prefix = "mycel-dev"
}

module "vertex_ai" {
  source = "../../modules/vertex-ai"

  project_id         = var.project_id
  region             = var.region
  index_display_name = "mycel-dev-knowledge-index"
}

# Cloud Run is deployed via CI/CD after container build
# module "cloud_run" {
#   source = "../../modules/cloud-run"
#   ...
# }
