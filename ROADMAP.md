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
- [x] API layer (Cloud Run HTTP entrypoint, request/response contracts, proactive greeting)
- [x] RAG foundation (embedding generation, Firestore vector search, Context Dispatcher)
- [x] Cloud Run deployment (Dockerfile, Artifact Registry push, Terraform Cloud Run module, deploy script, public dev access)
- [x] Known issues fix (intent-aware pipeline routing, completeness score overhaul, proactive questions, graceful "don't know" handling, Zod validation cleanup)
- [x] Document Generator (ADR-005: async Markdown documentation from Knowledge Entries — Heimatbuch-style prose, chapter structure, gap hints)
- [x] Schema Bootstrap via Web Search (ADR-010: DomainBehaviorConfig presets, Google Search grounding via @google/genai, proposal/review workflow, hybrid mode)
- [x] Schema Evolution + Web Enrichment (ADR-011, ADR-012: pattern detection via clustering, evolution proposals with auto-apply, field stats tracking, async claim verification, search caching, enrichment markers in context/documents)

## In Progress

## Backlog (ordered by priority)
- [ ] Audio ingestion (Speech-to-Text via Vertex AI → pipeline)
- [ ] Image ingestion (Vision API → pipeline)
- [ ] Authentication and multi-tenancy
- [ ] Cloud Run hardening (deletion protection, ingress restrictions, Cloud Armor)
- [ ] Resolve `src → dist` symlink workaround in Dockerfile (refactor to package.json exports or bundler)
- [ ] Monitoring and observability

## Known Issues (conversation quality, iterative improvement)
- [x] Completeness score is unreliable (100% for "hi", 0% for actual content)
- [x] System doesn't let go when user says "I don't know" repeatedly
- [x] No proactive initial question based on domain schema (solved via API greeting)
- [x] Topic change detection (verified already working — classifier runs every turn)
- [x] Zod validation warnings for suggestedCategoryLabel on non-uncategorized classifications
- [x] "ask me something" should trigger proactive domain-based questions