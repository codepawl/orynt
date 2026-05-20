# Testing

## Strategy

**Unit tests** cover pure functions and business logic. Services and utility modules in `apps/api/app/services/` and `apps/web/lib/`. Aim for confidence, not coverage percentage.

**Integration tests** cover the FastAPI HTTP layer end-to-end against a test Supabase project. Every endpoint in `docs/API.md` has at least one happy-path and one failure-path test.

**E2E tests** cover the critical user flows that matter for revenue or trust: newsletter signup, contact form submission, product page render with stats. Use Playwright against a local dev environment.

**Type checking** is enforced and runs in CI. Mypy strict on Python. TS `strict: true` plus `noUncheckedIndexedAccess: true`. Failing types block merge.

## Framework

- Python: `pytest` plus `pytest-asyncio` for async tests, `httpx` for FastAPI client
- TypeScript: `vitest` for unit, `@testing-library/react` for component tests
- E2E: `@playwright/test`

## Coverage targets

- Unit: no hard percentage target. Every service module must have tests for its public functions. Internal helpers can be tested transitively.
- Integration: every endpoint in `docs/API.md` has happy + at least one failure path tested.
- E2E: the following flows must have green Playwright tests before each deploy:
  - Newsletter signup including confirm link (uses Resend test mode)
  - Contact form submission
  - Landing page loads with hero cycler visible
  - Product detail page loads with stats badge

## Definition of done

A feature is done when:

- All new code is type-checked clean (`mypy --strict`, `tsc --noEmit`)
- All new code has tests at the level specified above
- Lint passes with zero warnings (`ruff check` and the JS linter chosen)
- Manual smoke check completed in dev environment
- All `<acceptance_criteria>` or `<done_when>` items from the roadmap phase are met
- Sentry shows no new errors in dev for 30 minutes after the change

## Pre-commit hooks

Use `pre-commit` (`uv add pre-commit --dev`) for Python and `lefthook` or `husky` for JS.

Hooks in order:

1. Format (`ruff format`, `biome format` or `prettier`)
2. Lint (`ruff check`, JS linter)
3. Typecheck (only on staged files for speed; full typecheck runs in CI)
4. Run fast unit tests only (skip integration and e2e)

If a hook fails, fix the issue. Do not bypass with `--no-verify`.

## CI test stages

GitHub Actions workflow runs on every PR:

1. Install deps (`bun install`, `uv sync`)
2. Lint both stacks
3. Typecheck both stacks
4. Unit tests both stacks
5. Integration tests against a Supabase test project (secrets in GH org secrets)
6. E2E tests with Playwright in headless mode

Stages run in parallel where possible. Average target wall time: under 6 minutes.

## Test data

- Python: `factory_boy` for entity factories
- TypeScript: hand-rolled fixtures in `apps/web/test/fixtures/`
- Supabase test project: dedicated project, wiped before each integration run via a SQL script in `apps/api/test/reset_test_db.sql`

## What NOT to test

- Generated code (`packages/shared/src/generated/`) is not unit-tested directly
- Third-party library behavior. Test that we call them correctly, not that they work
- The Tailwind config or `@theme` block
- Static MDX content; verify in manual review or visual diff if it becomes a problem
