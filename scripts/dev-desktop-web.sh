#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$ROOT_DIR"

PORT=${ORYNT_DESKTOP_PORT:-1420}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      shift
      ;;
    --port)
      if [ "$#" -lt 2 ]; then
        printf '%s\n' "error: --port requires a value." >&2
        exit 1
      fi
      PORT=$2
      shift 2
      ;;
    --port=*)
      PORT=${1#--port=}
      shift
      ;;
    *)
      printf '%s\n' "error: unsupported dev-desktop:web argument: $1" >&2
      printf '%s\n' "Use --port <port> or ORYNT_DESKTOP_PORT=<port> for alternate dev ports." >&2
      exit 1
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*)
    printf '%s\n' "error: port must be numeric, got '$PORT'." >&2
    exit 1
    ;;
esac

if command -v lsof >/dev/null 2>&1; then
  LISTENER=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$LISTENER" ]; then
    printf '%s\n' "error: port $PORT is already in use." >&2
    printf '%s\n' "$LISTENER" >&2
    printf '%s\n' "Stop that process, or rerun scripts/dev-desktop-web.sh --port <free-port>." >&2
    exit 1
  fi
fi

printf '%s\n' "Starting Orynt desktop web UI at http://127.0.0.1:$PORT/"
printf '%s\n' "Note: native folder browsing only works in the Tauri desktop app; paste local paths manually in this web preview."
exec pnpm --filter @codepawl/desktop dev --port "$PORT" --strictPort
