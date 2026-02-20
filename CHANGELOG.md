# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-02-20

Initial public release of the Mycel backend — the AI-powered Universal Knowledge Engine.

### Added

#### Multi-Agent Pipeline
- Five-agent conversation pipeline: Classifier, Context Dispatcher, Gap-Reasoning, Persona, and Structuring agents orchestrated via LangGraph.js
- Intent-based pipeline routing for natural conversation flow (greetings, clarifications, knowledge contributions)
- Vertex AI Gemini integration with JSON extraction, retry logic, and structured output validation

#### Knowledge Capture & Structuring
- Multi-turn conversation engine that captures unstructured knowledge and structures it into typed entries
- Adaptive schema evolution that detects new categories and fields from conversation patterns
- Real-time web enrichment: claims are extracted and validated against web sources asynchronously
- Document Generator: auto-generates structured Markdown knowledge bases from collected entries

#### Dynamic Schema System
- Domain Schema Bootstrap via web research — generate a complete domain schema from a plain-text description
- Schema Evolution with pattern detection for proposing new categories and fields
- Persona Schema for configuring communication style independently from domain logic
- Async job pattern for long-running schema generation with polling support

#### RAG (Retrieval-Augmented Generation)
- Cross-session knowledge recall via Firestore Vector Search
- Multilingual embeddings (text-multilingual-embedding-002)
- Configurable similarity threshold and top-K retrieval (15 results)

#### API Layer
- HTTP API built with Hono and deployed on Cloud Run
- Full OpenAPI 3.1 specification auto-generated via @hono/zod-openapi
- Interactive API documentation with Scalar UI at `/docs`
- CRUD endpoints for domains, personas, sessions, entries, documents, and evolution
- Session list and turn history endpoints for frontend integration

#### Authentication & Multi-Tenancy
- GCP Identity Platform with JWT validation (Google JWKS)
- Tenant-scoped data isolation: all Firestore data under `tenants/{tenantId}/`
- Per-request repository creation via middleware
- Global web-search cache shared across tenants

#### Persistence & Infrastructure
- Cloud Firestore with repository pattern (interface-based, injectable)
- In-memory repository implementations for unit testing
- Terraform modules for GCP resources (Firestore, Cloud Run, IAM, Artifact Registry)
- Docker multi-stage build for Cloud Run deployment
- CI pipeline with GitHub Actions (lint, typecheck, build, test, Terraform validation)

#### Developer Experience
- TypeScript monorepo with 5 packages (api, core, ingestion, schemas, shared)
- Strict TypeScript configuration (no `any`, explicit return types)
- Zod validation on all API inputs and agent outputs
- Comprehensive test suite (~50 test files, unit + Firestore integration tests)
- Firestore emulator support for local development
- Mock LLM mode for development without GCP credentials

### Documentation
- Architecture overview with Mermaid diagrams
- 15 Architecture Decision Records (ADRs)
- 12 implementation plans
- Security policy with vulnerability reporting process
- Contributing guidelines with PR workflow

[0.7.0]: https://github.com/mulkatz/mycel/releases/tag/v0.7.0
