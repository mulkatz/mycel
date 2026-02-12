# ADR-008: API Layer — Hono on Cloud Run

## Status

Accepted

## Date

2026-02-12

## Context

Mycel's engine needs an HTTP interface for clients to create sessions, submit conversation turns, and retrieve results. The engine was originally accessible only via an interactive CLI script. An HTTP API enables web and mobile frontends, third-party integrations, and deployment as a cloud service.

This decision covers two concerns that are tightly coupled: the HTTP framework choice and the deployment strategy. The framework must run well on the target platform, and the platform constrains the framework's design (stateless, fast cold starts, container-based).

## Decision

### Hono as HTTP Framework

Use Hono for the HTTP API layer.

Alternatives considered:
- **Express**: The Node.js default. Mature ecosystem, but heavy middleware model, no built-in TypeScript types for request/response, and not optimized for serverless cold starts. Many features (CORS, body parsing) require additional packages.
- **Fastify**: Better performance than Express, good TypeScript support. However, its plugin system and schema validation (via JSON Schema, not Zod) don't align with our existing Zod-based validation. Heavier than needed for a thin API layer.
- **tRPC**: Type-safe API layer with automatic client generation. Excellent for TypeScript-to-TypeScript communication, but overkill — we need a standard REST API that any client can consume, not a tightly coupled TypeScript RPC protocol.

Hono was chosen because:
- Ultralight (~14KB) with fast cold starts — critical for Cloud Run's scale-to-zero model
- Built on Web Standards (`Request`/`Response`) — portable across runtimes
- First-class TypeScript support with typed context and middleware
- Built-in CORS, request logging, and error handling — no additional packages needed
- Zod validation integrates naturally via middleware

### Stateless Design

The API is fully stateless — all session state lives in Firestore (ADR-006). Each request looks up the session, reconstructs a `SessionManager` with the appropriate schemas, processes the request, and returns. No in-memory state is held between requests.

This means `SessionManager` and pipeline compilation happen per-request. `StateGraph.compile()` is synchronous and fast (~1ms), making this overhead negligible compared to the LLM calls (~2-5 seconds per turn).

### Dependency Injection via Factory

`createApp(deps: AppDependencies)` accepts all dependencies (repositories, LLM client, embedding client) and returns a configured Hono app. This enables:
- Unit testing with in-memory repositories and mock LLM clients
- Production wiring in `index.ts` with real Firestore and Vertex AI clients
- No global state or singletons

### Cloud Run Deployment

Deploy the API as a Docker container on Cloud Run.

Key configuration:
- **Scale-to-zero** with min instances = 0 (dev), max instances = 2 (dev) — no idle costs
- **Startup probe** on `/health` — Cloud Run waits for the health check before routing traffic
- **120-second request timeout** — the agent pipeline runs 5 sequential LLM calls, which can take 10-30 seconds total; 120s provides headroom for slow models or retries
- **1 CPU / 512Mi memory** — sufficient for the Node.js runtime processing; compute-intensive work happens on Vertex AI's side

### Unauthenticated Access for Dev

The dev environment allows unauthenticated access (`allUsers` with `roles/run.invoker`), gated behind a Terraform variable (`allow_unauthenticated = true`). This simplifies testing during development. Production will require authentication (future work).

### Deployment Workflow

A shell script (`scripts/deploy.sh`) automates the build-push-deploy cycle: build Docker image with `--platform linux/amd64` (dev machine is ARM/Apple Silicon), tag with git SHA + `latest`, push to Artifact Registry, update Cloud Run service. No CI/CD pipeline yet — deployment is intentionally manual during dev.

The Dockerfile uses `ln -s dist src` symlinks per package to resolve a mismatch between development import paths (`@mycel/*/src/*`) and production layout (only `dist/` exists). This is a known workaround tracked in the backlog.

## Consequences

### Positive

- Lightweight API layer — Hono adds minimal overhead to cold starts
- Fully testable — `createApp()` factory with injected deps enables fast unit tests via `app.request()`
- Stateless design scales horizontally without session affinity
- Scale-to-zero eliminates idle costs during development
- Deploy script makes deployment a single command

### Negative

- Per-request `SessionManager` creation adds small overhead (mitigated by fast `StateGraph.compile()`)
- Unauthenticated dev access is a security risk if the URL leaks (mitigated by being dev-only)
- The `src → dist` symlink workaround is fragile and adds Docker build complexity
- 120-second timeout means slow LLM responses can hold connections open (Cloud Run bills per request-second)
