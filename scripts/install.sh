#!/bin/sh
set -eu

repository="${ORYNT_RELEASE_REPOSITORY:-codepawl/orynt}"
platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$platform" in
  linux) platform="linux" ;;
  darwin) platform="darwin" ;;
  *) echo "Unsupported operating system: $platform" >&2; exit 1 ;;
esac
machine="$(uname -m)"
case "$machine" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64)
    if [ "$platform" = "darwin" ]; then
      arch="arm64"
    else
      echo "Linux ARM has no native Orynt 0.1 archive; install with: npm install --global orynt" >&2
      exit 1
    fi
    ;;
  *) echo "Unsupported architecture: $machine" >&2; exit 1 ;;
esac

archive_name="orynt-${platform}-${arch}.tar.gz"
base_url="https://github.com/${repository}/releases/latest/download"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/orynt-install.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT HUP INT TERM
curl --fail --location --proto '=https' --tlsv1.2 \
  "${base_url}/${archive_name}" --output "${temporary_root}/${archive_name}"
curl --fail --location --proto '=https' --tlsv1.2 \
  "${base_url}/${archive_name}.sha256" --output "${temporary_root}/${archive_name}.sha256"
expected="$(cut -d ' ' -f 1 "${temporary_root}/${archive_name}.sha256")"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${temporary_root}/${archive_name}" | cut -d ' ' -f 1)"
else
  actual="$(shasum -a 256 "${temporary_root}/${archive_name}" | cut -d ' ' -f 1)"
fi
[ "$actual" = "$expected" ] || { echo "Orynt archive checksum mismatch." >&2; exit 1; }

payload="${temporary_root}/payload"
mkdir -p "$payload"
tar -xzf "${temporary_root}/${archive_name}" -C "$payload"
chmod 755 "${payload}/orynt"
version="$("${payload}/orynt" --version)"
share_root="${XDG_DATA_HOME:-$HOME/.local/share}/orynt"
versions_root="${share_root}/versions"
version_root="${versions_root}/${version}"
bin_root="${ORYNT_BIN_DIR:-$HOME/.local/bin}"
state_root="${ORYNT_STATE_HOME:-${XDG_STATE_HOME:-$HOME/.local/state}}/orynt"
mkdir -p "$versions_root" "$bin_root" "$state_root"
[ ! -e "$version_root" ] || { echo "Orynt ${version} is already installed." >&2; exit 1; }
mv "$payload" "$version_root"
temporary_link="${bin_root}/.orynt-link-$$"
ln -s "${version_root}/orynt" "$temporary_link"
mv -f "$temporary_link" "${bin_root}/orynt"
printf '%s\n' "$version" > "${state_root}/current.txt"
cat > "${state_root}/install-v1.json" <<EOF
{
  "schemaVersion": 1,
  "installKind": "native",
  "versionsRoot": "${versions_root}",
  "currentPointer": "${state_root}/current.txt",
  "launcherPath": "${bin_root}/orynt",
  "currentVersion": "${version}"
}
EOF
echo "Installed Orynt ${version} at ${bin_root}/orynt"
case ":$PATH:" in
  *":${bin_root}:"*) ;;
  *) echo "Add ${bin_root} to PATH to run orynt." ;;
esac
