#!/usr/bin/env bash
# Usage: read-pref.sh <key> [fallback]
# Resolution: preferences.json -> config.json -> built-in defaults -> fallback arg
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/project-root.sh"

KEY="${1:?Usage: read-pref.sh <key> [fallback]}"
FALLBACK="${2:-}"

KEY="$KEY" FALLBACK="$FALLBACK" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;
const FALLBACK = process.env.FALLBACK;

const DEFAULTS = {
  'release.changelog': 'true',
  'release.changelog_format': 'keep-a-changelog',
  'release.version_bump': 'conventional-commits',
  'docs.readme_on_milestone': 'prompt',
  'docs.auto_update_files': 'README.md',
  'conventions.commit_format': 'conventional',
  'mode': 'yolo',
  'depth': 'standard',
  'model_profile': 'balanced',
  'pr_workflow': 'false',
  'commit_docs': 'true',
  'workflow.research': 'true',
  'workflow.plan_check': 'true',
  'workflow.verifier': 'true',
  'worktree.enabled': 'false',
  'github.enabled': 'false',
  'github.issueMode': 'never',
  'workflows.execute-phase.post_task_command': '',
  'workflows.execute-phase.commit_style': 'conventional',
  'workflows.execute-phase.commit_scope_format': '{phase}-{plan}',
  'workflows.verify-work.extra_verification_commands': '[]',
  'workflows.complete-milestone.version_files': '[]',
  'workflows.complete-milestone.pre_release_commands': '[]'
};

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

const prefs = readJSON('.planning/preferences.json');
const config = readJSON('.planning/config.json');

const v = prefs[KEY] ?? resolveNested(config, KEY) ?? DEFAULTS[KEY] ?? FALLBACK ?? '';
process.stdout.write(typeof v === 'object' ? JSON.stringify(v) : String(v));
NODE_EOF
