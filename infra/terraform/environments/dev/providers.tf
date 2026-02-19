terraform {
  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "dev"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
