# Contributing to Mycel

Thank you for your interest in contributing to Mycel! This document provides guidelines
and information for contributors.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

- Use [GitHub Issues](https://github.com/mulkatz/mycel/issues) with the "bug" label
- Include: steps to reproduce, expected behavior, actual behavior, environment details
- Check existing issues first to avoid duplicates

### Suggesting Features

- Open a [GitHub Issue](https://github.com/mulkatz/mycel/issues) with the "enhancement" label
- Describe the use case and proposed solution
- Be open to discussion — there may be alternative approaches

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes following our conventions (see below)
4. Ensure all checks pass: `npm run typecheck && npm run lint && npm run test`
5. Commit with conventional commits: `feat: add new feature`
6. Push and open a Pull Request against `main`

### Development Setup

See [README.md](README.md#getting-started) for setup instructions.

## Conventions

- **Language:** All code, comments, and documentation in English
- **TypeScript:** Strict mode, no `any`, explicit return types
- **Imports:** Direct imports from specific modules — no barrel files (index.ts)
- **Validation:** Zod for all runtime validation
- **Errors:** Typed custom errors, never throw raw strings
- **Logging:** Use the shared logger (`@mycel/shared`), never `console.log`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- **Branches:** `feat/description`, `fix/description`

## Architecture Decisions

Significant decisions are documented as ADRs in `docs/adr/`. If your contribution involves
an architectural change, please propose an ADR first.

## Questions?

Open a [Discussion](https://github.com/mulkatz/mycel/discussions) for questions that
aren't bug reports or feature requests.
