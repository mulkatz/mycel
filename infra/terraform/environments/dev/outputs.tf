output "firestore_database" {
  description = "Firestore database name"
  value       = module.firestore.database_name
}

output "artifact_registry_url" {
  description = "Docker repository URL"
  value       = module.artifact_registry.repository_url
}

output "cloud_run_service_account" {
  description = "Cloud Run service account email"
  value       = module.iam.cloud_run_service_account_email
}
