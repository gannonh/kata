#!/bin/bash
set -euo pipefail

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
echo 'source $HOME/.cargo/env' >> ~/.bashrc
