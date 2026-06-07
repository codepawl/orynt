# CodePawl

CodePawl is a server-side coding-agent ecosystem designed for autonomous development orchestration. The repository houses **Openpawl**, the core agent engine, along with internal tracing and memory modules.

## Project Structure

This project is organized as a Bun-powered monorepo containing:
- **`apps/web`**: The public-facing website and product surface built on Next.js 16.
- **`apps/api`**: FastAPI gateway backend service.
- **`packages/core`** (`@codepawl/core`): The core Openpawl engine featuring LangGraph agent orchestration, trace ledger, and memory management interfaces.
- **`packages/cli`** (`@codepawl/cli`): The command-line interface for executing and testing coding agents.
- **`packages/shared`** (`@codepawl/shared`): Shared TypeScript definitions and interfaces.

## Quick Start

### 1. Installation

Install JavaScript/TypeScript dependencies at the root and Python dependencies for the API:
```bash
# Install JS workspace dependencies
bun install

# Install Python dependencies for the API
cd apps/api && uv sync && cd ../..
```

### 2. Copy Environment Template
```bash
cp .env.example .env.local
```

### 3. Run Development Servers

- **Frontend (Next.js)**:
  ```bash
  bun dev
  ```
- **API (FastAPI)**:
  ```bash
  bun dev:api
  ```
- **Agent CLI (Openpawl)**:
  ```bash
  bun dev:cli run "Plan a code refactoring task"
  ```

Web runs on `http://localhost:3000`, API on `http://localhost:8000`.

## Documentation

Specs and architecture details live in the `docs/` folder:
- [PRODUCT.md](file:///z:/home/nxank4/personal/codepawl/docs/PRODUCT.md) - Product definition and roadmap.
- [ARCHITECTURE.md](file:///z:/home/nxank4/personal/codepawl/docs/ARCHITECTURE.md) - System design and package details.
- [CLAUDE.md](file:///z:/home/nxank4/personal/codepawl/CLAUDE.md) - Guidelines for working on this repository.

## License

TBD.

