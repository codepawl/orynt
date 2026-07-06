#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$ROOT_DIR"

if command -v lsof >/dev/null 2>&1; then
  LISTENER=$(lsof -nP -iTCP:1420 -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$LISTENER" ]; then
    printf '%s\n' "error: port 1420 is already in use." >&2
    printf '%s\n' "$LISTENER" >&2
    printf '%s\n' "Stop that process, then rerun scripts/dev-desktop-web.sh." >&2
    exit 1
  fi
fi

printf '%s\n' "Starting Orynt desktop web UI at http://127.0.0.1:1420/"
printf '%s\n' "Note: native folder browsing only works in the Tauri desktop app; paste local paths manually in this web preview."
exec pnpm --filter @codepawl/desktop dev "$@"
