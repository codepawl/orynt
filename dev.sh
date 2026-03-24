#!/bin/bash

# Start all dev servers (frontend + github-api)
# Usage: ./dev.sh

cleanup() {
    echo ""
    echo "Shutting down..."
    kill $PID_WEB $PID_API 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# GitHub API (FastAPI)
echo "Starting GitHub API on :8000..."
cd apps/api
if [ ! -d ".venv" ]; then
    echo "Creating Python venv via uv..."
    uv venv .venv
    uv pip install --python .venv/bin/python -q -r requirements.txt
fi
.venv/bin/uvicorn app.main:app --reload --port 8000 &
PID_API=$!
cd ../..

# Frontend (Next.js)
echo "Starting Frontend on :3000..."
bun run dev &
PID_WEB=$!

echo ""
echo "Running:"
echo "  Frontend  → http://localhost:3000"
echo "  GitHub API → http://localhost:8000"
echo "  API Docs  → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all"

wait
