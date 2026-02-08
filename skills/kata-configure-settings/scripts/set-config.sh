#!/usr/bin/env bash
# Usage: set-config.sh <dot.key.path> <value>
# Handles: JSON parse, nested key set, type coercion, atomic write
set -euo pipefail

KEY="${1:?Usage: set-config.sh <key> <value>}"
VALUE="${2:?Usage: set-config.sh <key> <value>}"
CONFIG_FILE=".planning/config.json"

KEY="$KEY" VALUE="$VALUE" CONFIG_FILE="$CONFIG_FILE" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;
const VALUE = process.env.VALUE;
const FILE = process.env.CONFIG_FILE;

let config;
try { config = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
catch { config = {}; }

// Navigate/create nested path
const parts = KEY.split('.');
let obj = config;
for (let i = 0; i < parts.length - 1; i++) {
  if (!(parts[i] in obj) || typeof obj[parts[i]] !== 'object') {
    obj[parts[i]] = {};
  }
  obj = obj[parts[i]];
}

// Type coercion
let parsed;
if (VALUE === 'true') parsed = true;
else if (VALUE === 'false') parsed = false;
else if (VALUE !== '' && !isNaN(VALUE)) parsed = Number(VALUE);
else {
  // Try parsing as JSON (for arrays/objects)
  try {
    parsed = JSON.parse(VALUE);
  } catch {
    // Not valid JSON, treat as string
    parsed = VALUE;
  }
}

obj[parts[parts.length - 1]] = parsed;

// Atomic write
const tmp = FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
fs.renameSync(tmp, FILE);
NODE_EOF
