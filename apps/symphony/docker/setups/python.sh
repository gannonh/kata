#!/bin/bash
set -euo pipefail

apt-get update \
  && apt-get install -y python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*
