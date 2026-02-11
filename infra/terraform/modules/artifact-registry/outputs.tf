output "repository_url" {
  description = "Docker repository URL for pushing images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.mycel.repository_id}"
}
