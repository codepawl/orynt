#!/bin/bash

# Start both dev servers (FastAPI + Next.js) locally.
# Usage: ./dev.sh
#
# - apps/api uses uv + pyproject.toml. First run creates .venv and installs.
# - apps/web uses bun. First run installs deps via the workspace lockfile.

set -u

cleanup() {
    echo ""
    echo "Shutting down..."
    kill -- -$PID_WEB -$PID_API 2>/dev/null
    lsof -ti :3000 2>/dev/null | xargs -r kill 2>/dev/null
    lsof -ti :8000 2>/dev/null | xargs -r kill 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Refuse to start when ports are already in use.
if lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Port 3000 already in use. Run: lsof -i :3000   (then kill the PID)"
    exit 1
fi
if lsof -i :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Port 8000 already in use. Run: lsof -i :8000   (then kill the PID)"
    exit 1
fi

# FastAPI gateway
echo "Starting FastAPI on :8000..."
(
    cd apps/api
    uv sync --quiet
    setsid uv run uvicorn app.main:app --reload --port 8000
) &
PID_API=$!

# Next.js marketing site
echo "Starting Next.js on :3000..."
setsid bun --filter @codepawl/web dev &
PID_WEB=$!

echo ""
echo "Running:"
echo "  Frontend  → http://localhost:3000"
echo "  FastAPI   → http://localhost:8000"
echo "  API Docs  → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all"

wait
