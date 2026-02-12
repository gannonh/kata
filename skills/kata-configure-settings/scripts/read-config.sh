#!/usr/bin/env bash
# Usage: read-config.sh <dot.key.path> [fallback]
# Reads ONLY from .planning/config.json (no preferences cascade, no defaults)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/project-root.sh"

KEY="${1:?Usage: read-config.sh <dot.key.path> [fallback]}"
FALLBACK="${2:-}"

KEY="$KEY" FALLBACK="$FALLBACK" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;
const FALLBACK = process.env.FALLBACK;

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function resolveNested(obj, key) {
  const parts = key.split('.');
  let val = obj;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return undefined;
    val = val[p];
  }
  return val;
}

// Try .planning/config.json first, then main/.planning/config.json (worktree root)
const fs2 = require('fs');
const configPath = fs2.existsSync('.planning/config.json') ? '.planning/config.json'
  : fs2.existsSync('main/.planning/config.json') ? 'main/.planning/config.json'
  : '.planning/config.json';
const config = readJSON(configPath);
const v = resolveNested(config, KEY) ?? (FALLBACK || undefined) ?? '';
process.stdout.write(typeof v === 'object' ? JSON.stringify(v) : String(v));
NODE_EOF
