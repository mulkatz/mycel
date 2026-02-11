terraform {
  backend "gcs" {
    # Bucket must be created manually before first use:
    #   gsutil mb -l europe-west1 gs://mycel-terraform-state
    bucket = "mycel-terraform-state"
    prefix = "terraform/state"
  }
}
