#!/usr/bin/env node
// Kata Config Validator Hook
// Runs on SessionStart to validate .planning/config.json against known schema

import fs from 'fs';
import path from 'path';

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
  'github.issueMode': { type: 'enum', values: ['auto', 'never'] },
  'workflows.execute-phase.post_task_command': { type: 'string' },
  'workflows.execute-phase.commit_style': { type: 'enum', values: ['conventional', 'semantic', 'simple'] },
  'workflows.execute-phase.commit_scope_format': { type: 'string' },
  'workflows.verify-work.extra_verification_commands': { type: 'array' },
  'workflows.complete-milestone.version_files': { type: 'array' },
  'workflows.complete-milestone.pre_release_commands': { type: 'array' }
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
      if (typeof value !== 'boolean') {
        return `[kata] Config error: Invalid value for '${key}': expected boolean, got '${value}'`;
      }
      break;
    case 'enum':
      if (!schema.values.includes(value)) {
        return `[kata] Config error: Invalid value for '${key}': expected one of ${schema.values.join(', ')}; got '${value}'`;
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        return `[kata] Config error: Invalid value for '${key}': expected array, got '${value}'`;
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        return `[kata] Config error: Invalid value for '${key}': expected string, got '${value}'`;
      }
      break;
  }
  return null;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();

    const configPath = path.join(cwd, '.planning', 'config.json');
    if (!fs.existsSync(configPath)) {
      process.exit(0);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const entries = flattenConfig(config);
    const messages = [];

    for (const { key, value } of entries) {
      const schema = KNOWN_KEYS[key];
      if (!schema) {
        messages.push(`[kata] Config warning: Unknown key '${key}'`);
        continue;
      }
      const error = validateValue(key, value, schema);
      if (error) {
        messages.push(error);
      }
    }

    if (messages.length > 0) {
      console.log(messages.join('\n'));
    }
  } catch (e) {
    // Silent fail - never block session start
  }
  process.exit(0);
});
