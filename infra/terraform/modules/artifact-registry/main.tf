resource "google_artifact_registry_repository" "mycel" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  format        = "DOCKER"
  description   = "Mycel container images"
}
