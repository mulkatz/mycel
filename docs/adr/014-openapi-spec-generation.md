# ADR-014: OpenAPI Spec Generation via @hono/zod-openapi

## Status
Accepted

## Context
Mycel's API has 18 endpoints across 6 route files. A future frontend repository needs an OpenAPI 3.1 spec as the API contract for type-safe client generation. The existing Hono routes use Zod schemas for validation but produce no machine-readable API documentation.

## Decision
Adopt `@hono/zod-openapi` (v0.19.x for zod 3.x compatibility) to refactor all routes from `Hono` + manual `.parse()` to `OpenAPIHono` + `createRoute()` + `app.openapi()`. This enables automatic OpenAPI 3.1 spec generation from the same Zod schemas already used for validation.

### Key choices:
- **Library**: `@hono/zod-openapi` is the official Hono middleware for OpenAPI. It's a superset of Hono — `OpenAPIHono` extends `Hono` — so all existing middleware works unchanged.
- **Validation**: Route-level validation replaces manual `.parse()` calls. A shared `createRouter()` factory in `types.ts` configures a `defaultHook` on every router to produce consistent validation error responses matching our existing `ErrorResponse` format.
- **Spec trigger**: Manual via `npm run generate:openapi`. The spec changes only when routes change, so CI-based generation is not needed yet.
- **Spec storage**: The generated `openapi.json` is committed to the repo root. The frontend can reference it directly.

## Consequences
- All route handlers use `c.req.valid('json')` / `c.req.valid('param')` instead of manual schema parsing
- Response schemas are defined in `packages/api/src/schemas/responses.ts` and registered as OpenAPI components
- The `ZodError` branch in `error-handler.ts` remains as a safety net but route-level validation is now handled by the `defaultHook`
- Adding new endpoints requires defining a `createRoute()` config with request/response schemas
