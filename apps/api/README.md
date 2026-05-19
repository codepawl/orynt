# codepawl-api

FastAPI gateway in front of Supabase. Single entry point for all data reads and writes per ADR-004.

## Local dev

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Quality gates

```bash
uv run mypy .
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

## Database

Supabase migrations live in `apps/api/migrations/`. Apply with the Supabase CLI:

```bash
uv run supabase migration up
```

Seed the products table:

```bash
uv run python -m seed.products
```
