resource "google_project_service" "identity_platform" {
  project            = var.project_id
  service            = "identitytoolkit.googleapis.com"
  disable_on_destroy = false
}

resource "google_identity_platform_config" "default" {
  project = var.project_id

  sign_in {
    anonymous {
      enabled = true
    }
  }

  depends_on = [google_project_service.identity_platform]
}
