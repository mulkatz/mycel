# CLAUDE.md – Mycel Project Context

## Project Overview
Mycel is an AI-powered Universal Knowledge Engine (UKE) that captures decentralized,
unstructured knowledge through multimodal dialogues and structures it using a
multi-agent system. The project is closed-source and proprietary.

## Tech Stack
- TypeScript (strict mode) for all code
- Node.js 20+ runtime
- npm workspaces monorepo
- GCP: Cloud Run, Vertex AI, Cloud Storage, Vector Search, Firestore
- Terraform for infrastructure
- LangGraph.js for agent orchestration
- Zod for runtime schema validation
- Vitest for testing

## Project Structure
Monorepo with four packages:
- `packages/core` – AI engine (agents, orchestration, RAG)
- `packages/ingestion` – Multimodal input processing (audio, image, text)
- `packages/schemas` – Domain and Persona schema definitions + validation
- `packages/shared` – Shared types, utilities, logger

## Architecture Principles
- **Genericity**: Engine is configured via Domain Schema (what knowledge?) and
  Persona Schema (how to communicate?). No hardcoded domain logic in the engine.
- **Multi-Agent System**: Classifier → Context Dispatcher → Gap-Reasoning →
  Persona → Structuring. Each agent has a single responsibility.
- **Gap-Analysis**: The system proactively identifies missing knowledge and asks
  follow-up questions.
- **Separation of Concerns**: Engine, Domain, and Persona are strictly decoupled.
- **Repository Pattern**: Data access via interfaces (`SessionRepository`,
  `KnowledgeRepository`, `SchemaRepository`). In-memory implementations for tests,
  Firestore implementations for production. Repositories are injected, never imported directly.

## Code Conventions
- All code and comments in English
- Strict TypeScript: no `any`, explicit return types, no unused variables
- Use Zod for all runtime validation (API inputs, schema configs, agent outputs)
- Prefer named exports over default exports
- Use direct imports, no barrel files (index.ts) – import from the specific module
- Error handling: use typed custom errors, never throw raw strings
- Logging: use the shared logger (`@mycel/shared`), never `console.log`
- Prefer pure functions and immutable data where possible

## Commands
- `npm install` – Install all workspace dependencies
- `npm run build` – Build all packages
- `npm run lint` – ESLint across all packages
- `npm run typecheck` – TypeScript type checking
- `npm run test` – Run unit tests (Vitest, excludes integration tests)
- `npm run test:integration` – Run Firestore integration tests (requires emulator)
- `npm run emulator:start` – Start Firestore emulator on localhost:8080
- `npm run format` – Prettier formatting

## Testing
- Vitest as test runner
- Test files: `*.test.ts` co-located next to source files
- Integration tests: `*.integration.test.ts` (require Firestore emulator, excluded from `npm test`)
- Aim for unit tests on all agent logic and schema validation
- Use descriptive test names: `it('should classify audio input as history category')`

## Git Conventions
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- Branch naming: `feat/description`, `fix/description`
- Never commit secrets, credentials, or .tfvars files
- Keep commits atomic and focused

## Infrastructure
- Terraform in `infrastructure/` with environment separation (dev/prod)
- Remote state in GCS bucket
- All GCP resources defined as reusable Terraform modules
- Use `terraform.tfvars.example` as templates, never commit actual `.tfvars`

## Security Rules
- Never hardcode API keys, project IDs, or credentials anywhere
- Use environment variables or GCP Secret Manager for all secrets
- All .env and .tfvars files are gitignored
- Review .gitignore before every commit involving new file types

## Package Dependencies
- Cross-package imports use workspace protocol: `"@mycel/shared": "*"`
- External dependencies should be added to the specific package that needs them
- Keep the dependency tree minimal – avoid adding packages for trivial functionality

## Documentation Rules
- CLAUDE.md is the single source of truth for AI context
- Only document what would cause incorrect decisions if missing
- CLAUDE.md updates must be minimal diffs, not rewrites
- ADRs only for decisions where the "why" is non-obvious
- No package-level READMEs
- No inline comments explaining obvious code
- JSDoc only on public interfaces with non-obvious contracts
- When in doubt, don't document – the code should speak for itself

## CLAUDE.md Update Triggers
Update CLAUDE.md ONLY when:
- A new package is added or removed
- A new external dependency is introduced that affects architecture
- A convention changes (e.g. new testing pattern, new error handling approach)
- A non-obvious constraint exists that the code alone doesn't communicate

Do NOT update CLAUDE.md for:
- Implementation details of individual features
- Bug fixes
- Refactors that don't change the public API or conventions

## Task Workflow
Before starting any backlog item from ROADMAP.md:
1. Read the current codebase and CLAUDE.md
2. Write a detailed implementation plan as a markdown file in docs/plans/
3. Present the plan and ask for approval before coding
4. After completion: update CLAUDE.md only if needed, mark task as done in ROADMAP.md