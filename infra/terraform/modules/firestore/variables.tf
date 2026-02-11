variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "database_id" {
  description = "Firestore database ID"
  type        = string
  default     = "(default)"
}
