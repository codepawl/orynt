# Codepawl

Open-source AI agent products plus a curated AI/ML research surface. The website and product catalog for an AI agent company.

## Status

Pre-MVP rebuild. May 2026. Greenfield restructure on top of a prior community-platform codebase. New design system, new monorepo layout, narrower scope.

## Quick start

```bash
# Install JS workspace deps
bun install

# Install Python deps for the API
cd apps/api && uv sync && cd ../..

# Copy env template
cp .env.example .env.local

# Run web (Next.js)
bun --filter @codepawl/web dev

# Run API (FastAPI) in another terminal
cd apps/api && uv run uvicorn main:app --reload
```

Web runs on `http://localhost:3000`, API on `http://localhost:8000`.

## Documentation

Specs and execution plan live in `docs/`. Start with:

- `docs/PRODUCT.md` what this is and who it serves
- `docs/ROADMAP.md` execution phases in order
- `CLAUDE.md` rules for Claude Code in this repo

## License

TBD. The website is closed-source. Individual products listed on `/products` have their own MIT-licensed repos under the `codepawl` GitHub org.
