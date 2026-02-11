resource "google_firestore_database" "main" {
  project     = var.project_id
  name        = var.database_id
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}

resource "google_firestore_index" "knowledge_entries_category_created" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "knowledgeEntries"

  fields {
    field_path = "categoryId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "knowledge_entries_category_status_created" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "knowledgeEntries"

  fields {
    field_path = "categoryId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }

  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "knowledge_entries_status_created" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "knowledgeEntries"

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }

  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "knowledge_entries_session_created" {
  project    = var.project_id
  database   = google_firestore_database.main.name
  collection = "knowledgeEntries"

  fields {
    field_path = "sessionId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "createdAt"
    order      = "ASCENDING"
  }
}
