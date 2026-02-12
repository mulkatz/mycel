output "identity_platform_enabled" {
  description = "Whether Identity Platform is enabled"
  value       = true

  depends_on = [google_identity_platform_config.default]
}
