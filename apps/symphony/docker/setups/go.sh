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

curl -fsSL "https://go.dev/dl/${GO_VERSION}.linux-${GO_ARCH}.tar.gz" | tar -C /usr/local -xz
ln -sf /usr/local/go/bin/go /usr/local/bin/go
ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
