# Implement async domain schema generation with background processing and polling

Follow the standard task workflow from CLAUDE.md (ADR, plan, approval, then implement).

## Problem

`POST /domains/generate` currently runs synchronously for ~2 minutes (domain analysis + 10 web searches + schema synthesis). This causes frontend fetch connections to hang or be interrupted by browsers/proxies, leaving the UI in a broken loading state with no error feedback.

## Desired Architecture

Convert domain generation from a synchronous request/response to an async job pattern:

1. **`POST /domains/generate`** returns `202 Accepted` immediately with `{ proposalId, status: "generating" }` after creating a proposal record in Firestore with status `"generating"`
2. **Generation runs in the background** (not blocking the HTTP response). On completion, updates the proposal status to `"pending"` (ready for review). On failure, updates status to `"failed"` with error details.
3. **`GET /domains/proposals/{proposalId}`** already exists — the frontend polls this until status changes from `"generating"` to `"pending"` (success) or `"failed"` (error)
4. **Frontend** replaces the single long-running mutation with: a quick POST, then polling with `useQuery` + `refetchInterval` until terminal state

## Error Handling Requirements (CRITICAL)

- The proposal record MUST store failure information when generation fails: `failureReason` (human-readable message), `failedAt` (timestamp)
- The `GET /proposals/{proposalId}` response MUST include these fields so the frontend can display meaningful error messages
- All failure modes must be captured: LLM errors, web search failures, validation errors, unexpected exceptions
- The frontend must handle: generation in progress (show progress/spinner), success (navigate to review), failure (show error with reason, allow retry)

## Current Implementation (key files)

**Backend (monorepo at `/Users/franz/Workspace/mycel`):**

- `packages/api/src/routes/schema-generator.ts` — route handlers for generate, review, get proposal
- `packages/api/src/schemas/responses.ts` — Zod response schemas (SchemaGenerateResponseSchema, SchemaProposalResponseSchema)
- `packages/core/src/services/schema-generator/schema-generator.ts` — orchestrator that calls domain-analyzer -> web search -> schema-synthesizer
- `packages/core/src/repositories/schema-proposal.repository.ts` — SchemaProposal interface and repository (has `status: 'pending' | 'approved' | 'rejected'`, needs `'generating' | 'failed'`)
- `packages/core/src/repositories/in-memory-schema-proposal.repository.ts` — in-memory impl for tests
- `packages/core/src/infrastructure/firestore-schema-proposal.repository.ts` — Firestore impl

**Frontend (separate repo at `/Users/franz/Workspace/mycel-web`):**

- `apps/admin/src/routes/domain-generate.tsx` — generate page with form submission and toast handling
- `apps/admin/src/routes/proposal-review.tsx` — proposal review page
- `apps/admin/src/hooks/use-domains.ts` — `useGenerateDomain()` mutation, `useProposalDetail()` query
- `packages/api-client/src/client.ts` — openapi-fetch client with auth middleware

## Quick Win (do first)

Trim the Vertex AI grounding redirect URLs from the `POST /domains/generate` response body. They are massive, already stored in Firestore via the proposal, and bloat the response from 25KB to ~3KB. The proposal detail endpoint already returns them separately.

## Additional Context

- Deploy script: `MYCEL_GCP_PROJECT_ID=mycel-dev-1348 scripts/deploy.sh`
- Cloud Run service URL: `https://mycel-api-xd2kik7xbq-ey.a.run.app`
- Docker daemon is OrbStack (`open -a OrbStack` to start before deploying)
