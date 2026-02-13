#!/usr/bin/env bash
# Usage: check-config.sh
# Validates .planning/config.json against known schema
# Output: Warning messages to stdout
# Exit: Always 0 (warnings only, never blocks)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../kata-configure-settings/scripts/project-root.sh"

# Exit silently if no config file
[ -f .planning/config.json ] || exit 0

node << 'NODE_EOF'
const fs = require('fs');

const KNOWN_KEYS = {
  'mode': { type: 'enum', values: ['yolo', 'interactive'] },
  'depth': { type: 'enum', values: ['quick', 'standard', 'comprehensive'] },
  'model_profile': { type: 'enum', values: ['quality', 'balanced', 'budget'] },
  'commit_docs': { type: 'boolean' },
  'pr_workflow': { type: 'boolean' },
  'parallelization': { type: 'boolean' },
  'workflow.research': { type: 'boolean' },
  'workflow.plan_check': { type: 'boolean' },
  'workflow.verifier': { type: 'boolean' },
  'github.enabled': { type: 'boolean' },
  'github.issue_mode': { type: 'enum', values: ['auto', 'ask', 'never'] },
  'workflows.execute-phase.post_task_command': { type: 'string' },
  'workflows.execute-phase.commit_style': { type: 'enum', values: ['conventional', 'semantic', 'simple'] },
  'workflows.execute-phase.commit_scope_format': { type: 'string' },
  'workflows.verify-work.extra_verification_commands': { type: 'array' },
  'workflows.complete-milestone.version_files': { type: 'array' },
  'workflows.complete-milestone.pre_release_commands': { type: 'array' },
  'worktree.enabled': { type: 'boolean' }
};

function flattenConfig(obj, prefix = '') {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenConfig(value, fullKey));
    } else {
      entries.push({ key: fullKey, value });
    }
  }
  return entries;
}

function validateValue(key, value, schema) {
  switch (schema.type) {
    case 'boolean':
      if (typeof value !== 'boolean')
        return `[kata] Config error: Invalid value for '${key}': expected boolean, got '${value}'`;
      break;
    case 'enum':
      if (!schema.values.includes(value))
        return `[kata] Config error: Invalid value for '${key}': expected one of ${schema.values.join(', ')}; got '${value}'`;
      break;
    case 'array':
      if (!Array.isArray(value))
        return `[kata] Config error: Invalid value for '${key}': expected array, got '${value}'`;
      break;
    case 'string':
      if (typeof value !== 'string')
        return `[kata] Config error: Invalid value for '${key}': expected string, got '${value}'`;
      break;
  }
  return null;
}

try {
  const config = JSON.parse(fs.readFileSync('.planning/config.json', 'utf8'));
  const entries = flattenConfig(config);

  for (const { key, value } of entries) {
    const schema = KNOWN_KEYS[key];
    if (!schema) {
      console.log(`[kata] Config warning: Unknown key '${key}'`);
      continue;
    }
    const error = validateValue(key, value, schema);
    if (error) console.log(error);
  }
} catch (e) {
  // Silent fail - never block skill execution
}
NODE_EOF

exit 0
