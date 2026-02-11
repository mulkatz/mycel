variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "mycel-api"
}

variable "image" {
  description = "Container image URL"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables for the service"
  type        = map(string)
  default     = {}
}

resource "google_cloud_run_v2_service" "mycel" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  template {
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
      max_instance_count = 10
    }
  }
}

output "service_url" {
  value = google_cloud_run_v2_service.mycel.uri
}
