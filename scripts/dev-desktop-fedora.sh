#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$ROOT_DIR"

if [ ! -x /usr/bin/pkg-config ]; then
  printf '%s\n' "error: /usr/bin/pkg-config was not found or is not executable." >&2
  printf '%s\n' "Install Fedora pkg-config support before launching the Tauri desktop app." >&2
  exit 1
fi

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
      printf '%s\n' "error: unsupported dev-desktop argument: $1" >&2
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
    printf '%s\n' "Stop that process, or rerun scripts/dev-desktop-fedora.sh --port <free-port>." >&2
    exit 1
  fi
fi

unset PKG_CONFIG_LIBDIR
unset PKG_CONFIG_SYSROOT_DIR

USER_ID=$(id -u)
: "${XDG_RUNTIME_DIR:=/run/user/$USER_ID}"
export XDG_RUNTIME_DIR

if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "$XDG_RUNTIME_DIR/bus" ]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_ID/bus"
fi

if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
  export WAYLAND_DISPLAY=wayland-0
fi

if [ -z "${DISPLAY:-}" ]; then
  export DISPLAY=:0
fi

if [ -z "${XAUTHORITY:-}" ]; then
  for XAUTH_CANDIDATE in "$XDG_RUNTIME_DIR"/xauth_*; do
    if [ -f "$XAUTH_CANDIDATE" ]; then
      export XAUTHORITY="/run/user/$USER_ID/$(basename "$XAUTH_CANDIDATE")"
      break
    fi
  done
fi

if [ -n "${WAYLAND_DISPLAY:-}" ]; then
  DEFAULT_GDK_BACKEND=wayland
else
  DEFAULT_GDK_BACKEND=x11
fi

export GDK_BACKEND="${ORYNT_GDK_BACKEND:-$DEFAULT_GDK_BACKEND}"
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export ORYNT_DEFAULT_REPOSITORY_PATH="$ROOT_DIR"
export PKG_CONFIG=/usr/bin/pkg-config
export PKG_CONFIG_PATH=/usr/lib64/pkgconfig:/usr/share/pkgconfig
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}

TAURI_DEV_CONFIG=$(printf '{"build":{"beforeDevCommand":"pnpm dev --port %s --strictPort","devUrl":"http://127.0.0.1:%s/"}}' "$PORT" "$PORT")
printf '%s\n' "Starting Orynt desktop app at http://127.0.0.1:$PORT/"
exec pnpm --filter @codepawl/desktop exec tauri dev --config "$TAURI_DEV_CONFIG"
