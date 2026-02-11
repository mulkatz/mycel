terraform {
  backend "gcs" {
    bucket = "mycel-terraform-state-1348"
    prefix = "dev"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
