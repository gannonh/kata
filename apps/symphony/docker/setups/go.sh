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
GO_SHA_URL="${GO_URL}.sha256"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

TARBALL_PATH="${TMP_DIR}/${GO_TARBALL}"
SHA_PATH="${TMP_DIR}/${GO_TARBALL}.sha256"

curl -fsSL "$GO_URL" -o "$TARBALL_PATH"
curl -fsSL "$GO_SHA_URL" -o "$SHA_PATH"

GO_SHA256=$(tr -d '\n\r[:space:]' < "$SHA_PATH")
if [[ -z "$GO_SHA256" ]]; then
  echo "Failed to read Go SHA256 checksum from ${GO_SHA_URL}" >&2
  exit 1
fi

printf '%s  %s\n' "$GO_SHA256" "$TARBALL_PATH" | sha256sum -c -
tar -C /usr/local -xzf "$TARBALL_PATH"
ln -sf /usr/local/go/bin/go /usr/local/bin/go
ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
