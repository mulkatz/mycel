resource "google_cloud_run_v2_service" "mycel" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  template {
    service_account = var.service_account_email

    containers {
      image = var.image

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instance_count
    }
  }
}
