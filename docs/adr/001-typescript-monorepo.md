# ADR-001: TypeScript Monorepo with npm Workspaces

## Status

Accepted

## Date

2026-02-11

## Context

Mycel consists of multiple logical components: the AI engine (agents, orchestration), ingestion processing, schema validation, and shared utilities. We need a project structure that enables:

- Type safety across all components
- Code and type sharing between packages
- A single language for the entire stack (engine, API, tooling)
- Independent versioning and dependency management per package

Alternative approaches considered:
- **Polyglot**: Python for AI, TypeScript for API – rejected due to type boundary issues and increased operational complexity
- **Single package**: All code in one package – rejected due to poor separation of concerns and coupling
- **Turborepo/Nx**: Full monorepo tooling – rejected as premature for the current project size; npm workspaces provide sufficient capability

## Decision

Use a TypeScript monorepo with npm workspaces and TypeScript Project References:

- Four packages: `core`, `ingestion`, `schemas`, `shared`
- Shared `tsconfig.base.json` with strict mode
- TypeScript Project References for cross-package type checking
- npm workspaces for dependency management and script orchestration

## Consequences

**Positive:**
- Full type safety across package boundaries
- Single language reduces context switching and tooling complexity
- Shared types eliminate integration bugs at compile time
- npm workspaces handle dependency hoisting and cross-linking

**Negative:**
- All contributors must be proficient in TypeScript
- TypeScript build times increase with project size (mitigated by incremental builds)
- npm workspaces have fewer features than dedicated monorepo tools (acceptable trade-off for simplicity)
