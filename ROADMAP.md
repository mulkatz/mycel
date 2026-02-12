# Roadmap

## Task Workflow

Before starting any task from the backlog:

1. Read the current codebase and CLAUDE.md
2. Write a detailed implementation plan as a markdown file in `docs/plans/`
3. Present the plan and ask for approval before writing any code
4. After completion: update CLAUDE.md only if conventions or architecture changed
5. Mark the task as done and move it to the Completed section

## Completed

- [x] Project initialization (monorepo, TypeScript, Terraform structure)
- [x] Vertical slice: Text → Agent Pipeline → Structured Output
- [x] Multi-turn conversation loop (Session Manager, state accumulation, interactive CLI)
- [x] Real LLM validation (Vertex AI / Gemini integration, prompt tuning, error handling)
- [x] Adaptive Schema Evolution (ADR-004: `_uncategorized` fallback, exploratory gap-reasoning, suggestedCategoryLabel/topicKeywords)
- [x] Persistence layer (Firestore Native Mode, Repository Pattern, emulator integration tests)
- [x] Terraform deployment (dev environment on GCP: Firestore, Cloud Run, IAM, Artifact Registry)

## In Progress

## Backlog (ordered by priority)
- [ ] API layer (Cloud Run HTTP entrypoint, request/response contracts)
- [ ] RAG foundation (embedding generation, Vertex AI Vector Search, Context Dispatcher)
- [ ] Dynamic schema evolution (schemas emerge from conversation, no predefined categories required)
- [ ] Web Search agent (autonomous research during conversation, validate user claims, enrich follow-up questions)
- [ ] Audio ingestion (Speech-to-Text via Vertex AI → pipeline)
- [ ] Image ingestion (Vision API → pipeline)
- [ ] Authentication and multi-tenancy
- [ ] Monitoring and observability