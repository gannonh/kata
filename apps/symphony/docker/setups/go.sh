#!/bin/bash
set -euo pipefail

GO_VERSION="${GO_VERSION:-go1.26.1}"
if [[ -z "${GO_VERSION}" ]]; then
  echo "GO_VERSION must be set (for example: go1.26.1)" >&2
  exit 1
fi

ARCH=$(dpkg --print-architecture)
case "$ARCH" in
  amd64) GO_ARCH=amd64 ;;
  arm64) GO_ARCH=arm64 ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

GO_TARBALL="${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
GO_URL="https://go.dev/dl/${GO_TARBALL}"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

TARBALL_PATH="${TMP_DIR}/${GO_TARBALL}"

# Download tarball
curl -fsSL "$GO_URL" -o "$TARBALL_PATH"

# Fetch checksum from Go's JSON release API.
# The per-file .sha256 URLs on go.dev return HTML redirects, not checksums.
# The JSON API provides checksums for all files in each release.
GO_SHA256=$(curl -fsSL "https://go.dev/dl/?mode=json" \
  | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const rel = data.find(r => r.version === '${GO_VERSION}');
    if (!rel) { process.exit(1); }
    const file = rel.files.find(f => f.filename === '${GO_TARBALL}');
    if (!file) { process.exit(1); }
    process.stdout.write(file.sha256);
  " 2>/dev/null)

if [[ -z "$GO_SHA256" ]]; then
  echo "Failed to fetch SHA256 checksum for ${GO_TARBALL} from go.dev JSON API" >&2
  exit 1
fi

printf '%s  %s\n' "$GO_SHA256" "$TARBALL_PATH" | sha256sum -c -
tar -C /usr/local -xzf "$TARBALL_PATH"
ln -sf /usr/local/go/bin/go /usr/local/bin/go
ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
