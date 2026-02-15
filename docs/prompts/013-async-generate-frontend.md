# Refactor: Adapt to Async Domain Schema Generation

## What Changed (Backend)

`POST /domains/generate` was converted from a synchronous endpoint (30-120s blocking) to an async job pattern. The frontend must now poll for completion instead of waiting for the full result.

### Before (old)

```
POST /domains/generate → 201
{
  "proposalId": "abc-123",
  "status": "pending",
  "domain": { "name": "...", "categories": [...], ... },
  "behavior": { ... },
  "reasoning": "...",
  "sources": ["https://..."]
}
```

### After (new)

```
POST /domains/generate → 202
{
  "proposalId": "abc-123",
  "status": "generating"
}
```

The full result is now available via polling:

```
GET /domains/proposals/{proposalId} → 200
```

This endpoint returns different shapes depending on `status`:

**`status: "generating"`** (still in progress):
```json
{
  "id": "abc-123",
  "status": "generating",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**`status: "pending"`** (generation complete, ready for review):
```json
{
  "id": "abc-123",
  "status": "pending",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "domain": { "name": "...", "version": "1.0.0", "description": "...", "categories": [...] },
  "behavior": { ... },
  "reasoning": "Analyzed domain ...",
  "sources": ["https://..."]
}
```

**`status: "failed"`** (generation failed):
```json
{
  "id": "abc-123",
  "status": "failed",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "failureReason": "All web searches failed. Cannot generate schema without research data.",
  "failedAt": "2025-01-01T00:00:30.000Z"
}
```

## What Needs to Change (Frontend)

### 1. API Client / Types

Update the generate response type — it no longer contains `domain`, `behavior`, `reasoning`, or `sources`:

```typescript
// Old
interface GenerateResponse {
  proposalId: string;
  status: 'pending';
  domain: DomainConfig;
  behavior: BehaviorConfig;
  reasoning: string;
  sources: string[];
}

// New
interface GenerateResponse {
  proposalId: string;
  status: 'generating';
}
```

Update the proposal response type to include all possible statuses and failure fields:

```typescript
interface ProposalResponse {
  id: string;
  status: 'generating' | 'pending' | 'approved' | 'rejected' | 'failed';
  createdAt: string;
  // Present when status is 'pending' | 'approved' | 'rejected'
  domain?: DomainConfig;
  behavior?: BehaviorConfig;
  reasoning?: string;
  sources?: string[];
  // Present when status is 'failed'
  failureReason?: string;
  failedAt?: string;
}
```

Update the HTTP status expectation for generate from `201` to `202`.

### 2. Generation Flow — Add Polling

After `POST /domains/generate` returns, implement polling on `GET /domains/proposals/{proposalId}`:

- Poll interval: 2-3 seconds
- Timeout: ~3 minutes (generation typically takes 30-120s)
- Stop polling when `status` is `"pending"` (success) or `"failed"` (error)
- Show the domain/behavior/reasoning/sources data only after status becomes `"pending"`

### 3. UI States

The generation flow now has three distinct UI states instead of two:

| State | Trigger | UI |
|-------|---------|-----|
| **Generating** | POST returns 202 | Progress indicator / skeleton / "Analyzing domain..." message. The user should see this is working, not hanging. |
| **Complete** | Poll returns `status: "pending"` | Show the generated schema for review (domain, categories, reasoning, sources). This is the existing review UI. |
| **Failed** | Poll returns `status: "failed"` | Show error message from `failureReason`. Offer a "Try Again" button. |

### 4. Review Endpoint Guards

The review endpoint (`POST /domains/proposals/{id}/review`) now returns specific errors for non-reviewable states:

- `status: "generating"` → 400: "Proposal is still generating. Please wait."
- `status: "failed"` → 400: "Proposal generation failed and cannot be reviewed."

If the frontend gates the review UI behind `status === "pending"`, these should never trigger. But handle them gracefully as edge cases (e.g., if two tabs are open).

### 5. Summary of Endpoints

| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| `/domains/generate` | POST | **202** (was 201) | `{ proposalId, status: "generating" }` |
| `/domains/proposals/{id}` | GET | 200 | Status-dependent (see above) |
| `/domains/proposals/{id}/review` | POST | 200 | `{ status, proposalId, domainSchemaId? }` (unchanged) |
