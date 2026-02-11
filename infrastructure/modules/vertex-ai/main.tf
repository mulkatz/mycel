variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Vertex AI resources"
  type        = string
}

variable "index_display_name" {
  description = "Display name for the Vector Search index"
  type        = string
  default     = "mycel-knowledge-index"
}

variable "embedding_dimensions" {
  description = "Dimensions for embedding vectors"
  type        = number
  default     = 768
}

resource "google_vertex_ai_index" "knowledge" {
  project      = var.project_id
  region       = var.region
  display_name = var.index_display_name

  metadata {
    contents_delta_uri = ""
    config {
      dimensions                  = var.embedding_dimensions
      approximate_neighbors_count = 50
      shard_size                  = "SHARD_SIZE_SMALL"

      algorithm_config {
        tree_ah_config {
          leaf_node_embedding_count    = 1000
          leaf_nodes_to_search_percent = 10
        }
      }
    }
  }

  index_update_method = "STREAM_UPDATE"
}

output "index_id" {
  value = google_vertex_ai_index.knowledge.id
}
