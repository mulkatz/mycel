# ADR-002: GCP Infrastructure with Terraform

## Status

Accepted

## Date

2026-02-11

## Context

Mycel requires cloud infrastructure for:

- Hosting the API and orchestration service
- Running LLM inference for the multi-agent system
- Storing and indexing knowledge for vector search (RAG)
- Processing multimodal input (speech-to-text, vision)

Key requirements:
- Strong AI/ML platform with Gemini model access
- Vector search capability for RAG
- Serverless compute to minimize operational overhead
- Infrastructure-as-code for reproducibility

Alternatives considered:
- **AWS**: Strong infrastructure, but Bedrock has less mature Gemini-equivalent models
- **Azure**: Good AI capabilities, but less integrated vector search offering
- **Manual setup**: Rejected – not reproducible, error-prone, no version control

## Decision

Use Google Cloud Platform with Terraform for all infrastructure:

- **Cloud Run** for serverless API and orchestration hosting
- **Vertex AI** for Gemini 1.5 Pro/Flash LLM inference
- **Vertex AI Vector Search** for RAG knowledge retrieval
- **Cloud Storage** for ingestion pipeline and knowledge storage
- **Terraform** for declarative, version-controlled infrastructure management

Infrastructure is organized as reusable modules with environment separation (dev/prod).

## Consequences

**Positive:**
- Native access to Gemini models via Vertex AI
- Integrated vector search without third-party dependencies
- Serverless Cloud Run eliminates server management
- Terraform enables reproducible, auditable infrastructure changes
- Environment separation (dev/prod) from day one

**Negative:**
- GCP vendor lock-in for AI features (Vertex AI, Vector Search)
- Terraform learning curve for contributors unfamiliar with IaC
- GCP costs require monitoring (Vertex AI inference is usage-based)
