#!/usr/bin/env bash
# Usage: has-pref.sh <key>
# Exit 0 = user has expressed preference, exit 1 = no preference set
# Does NOT check defaults table -- purpose is detecting whether user has EXPRESSED a preference
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/project-root.sh"

KEY="${1:?Usage: has-pref.sh <key>}"

KEY="$KEY" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;

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

const config = readJSON('.planning/config.json');

// Key exists in config (explicitly set)
const inConfig = resolveNested(config, KEY) !== undefined;

process.exit(inConfig ? 0 : 1);
NODE_EOF
