#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$ROOT_DIR"

if [ ! -x /usr/bin/pkg-config ]; then
  printf '%s\n' "error: /usr/bin/pkg-config was not found or is not executable." >&2
  printf '%s\n' "Install Fedora pkg-config support before launching the Tauri desktop app." >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  LISTENER=$(lsof -nP -iTCP:1420 -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$LISTENER" ]; then
    printf '%s\n' "error: port 1420 is already in use." >&2
    printf '%s\n' "$LISTENER" >&2
    printf '%s\n' "Stop that process, then rerun scripts/dev-desktop-fedora.sh." >&2
    exit 1
  fi
fi

unset PKG_CONFIG_LIBDIR
unset PKG_CONFIG_SYSROOT_DIR

export GDK_BACKEND="${ORYNT_GDK_BACKEND:-x11}"
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export PKG_CONFIG=/usr/bin/pkg-config
export PKG_CONFIG_PATH=/usr/lib64/pkgconfig:/usr/share/pkgconfig
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:${PATH:-}

exec pnpm --filter @codepawl/desktop exec tauri dev "$@"
