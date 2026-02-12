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
- [x] Document Generator (async Markdown documentation from Knowledge Entries — local history book style, chapter structure, gap hints)
- [x] Dynamic Schema Bootstrap via Web Search — Phase 1 of 3 (DomainBehaviorConfig, web search client with Gemini grounding, schema generator, proposal → review → apply flow)
- [x] Conversational Schema Evolution — Phase 2 of 3 (pattern detection via embedding clustering, evolution proposals for new categories/fields/priority changes, field stats tracking, auto mode, schema-evolution-log)
- [x] Real-time Web Enrichment — Phase 3 of 3 (async claim extraction + validation during conversations, 7-day search cache, conflict flagging, enrichment metadata on Knowledge Entries, Context Dispatcher integration with verification markers)
- [x] Authentication and multi-tenancy (GCP Identity Platform anonymous auth, JWT validation via `jose`, tenant-scoped Firestore under `tenants/{tenantId}/`, migration script)
- [x] OpenAPI spec & Scalar API docs (`@hono/zod-openapi` route-level validation, `npm run generate:openapi`, Scalar UI at `/docs`)

## In Progress

## Backlog (ordered by priority)
- [ ] Frontend (Chat UI for knowledge contributors, Admin Dashboard for schema management + document browsing)
- [ ] Audio ingestion (Speech-to-Text via Vertex AI → pipeline)
- [ ] Image ingestion (Vision API → pipeline)
- [ ] Cloud Run hardening (deletion protection, ingress restrictions, Cloud Armor)
- [ ] Resolve `src → dist` symlink workaround in Dockerfile (refactor to package.json exports or bundler)
- [ ] Monitoring and observability

## Known Limitations
- [ ] `new_field` evolution proposals: infrastructure ready but not yet auto-triggered (only new_category and change_priority trigger automatically)
- [ ] Enrichment runs as floating promises in Cloud Run — if instance scales to zero mid-enrichment, the enrichment is lost (not critical, next session retriggers)
- [ ] No job queue for enrichment — acceptable at current scale, revisit if enrichment volume grows

## Known Issues (conversation quality, iterative improvement)
- [x] Completeness score is unreliable (100% for "hi", 0% for actual content)
- [x] System doesn't let go when user says "I don't know" repeatedly
- [x] No proactive initial question based on domain schema (solved via API greeting)
- [x] Topic change detection (verified already working — classifier runs every turn)
- [x] Zod validation warnings for suggestedCategoryLabel on non-uncategorized classifications
- [x] "ask me something" should trigger proactive domain-based questions