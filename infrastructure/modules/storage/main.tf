variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "bucket_name_prefix" {
  description = "Prefix for bucket names"
  type        = string
  default     = "mycel"
}

resource "google_storage_bucket" "ingestion" {
  name     = "${var.bucket_name_prefix}-ingestion-${var.project_id}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket" "knowledge" {
  name     = "${var.bucket_name_prefix}-knowledge-${var.project_id}"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

output "ingestion_bucket_name" {
  value = google_storage_bucket.ingestion.name
}

output "knowledge_bucket_name" {
  value = google_storage_bucket.knowledge.name
}
