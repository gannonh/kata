#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- Shared utilities ---

function resolveRoot() {
  const envRoot = process.env.KATA_PROJECT_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, '.planning'))) {
    return envRoot;
  }
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.planning'))) {
    return cwd;
  }
  if (fs.existsSync(path.join(cwd, 'workspace', '.planning'))) {
    return path.join(cwd, 'workspace');
  }
  if (fs.existsSync(path.join(cwd, 'main', '.planning'))) {
    return path.join(cwd, 'main');
  }
  process.stderr.write('ERROR: Cannot find project root (.planning/ directory).\n');
  process.stderr.write('Set KATA_PROJECT_ROOT or run from the project directory.\n');
  process.exit(1);
}

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
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

function formatValue(v) {
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

// --- DEFAULTS table (from read-pref.sh) ---

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
  'github.issue_mode': 'never',
  'workflows.execute-phase.post_task_command': '',
  'workflows.execute-phase.commit_style': 'conventional',
  'workflows.execute-phase.commit_scope_format': '{phase}-{plan}',
  'workflows.verify-work.extra_verification_commands': '[]',
  'workflows.complete-milestone.version_files': '[]',
  'workflows.complete-milestone.pre_release_commands': '[]'
};

// --- KNOWN_KEYS schema (from check-config.sh) ---

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

// --- Command: resolve-root ---

function cmdResolveRoot() {
  process.stdout.write(resolveRoot());
}

// --- Command: read-config ---

function cmdReadConfig(args) {
  const key = args[0];
  const fallback = args[1] || '';
  if (!key) {
    process.stderr.write('Usage: kata-lib.js read-config <dot.key.path> [fallback]\n');
    process.exit(1);
  }
  const root = resolveRoot();
  const primaryConfig = path.join(root, '.planning', 'config.json');
  const worktreeConfig = path.join(root, 'main', '.planning', 'config.json');
  const configPath = fs.existsSync(primaryConfig) ? primaryConfig
    : fs.existsSync(worktreeConfig) ? worktreeConfig
    : primaryConfig;
  const config = readJSON(configPath);
  const v = resolveNested(config, key) ?? (fallback || undefined) ?? '';
  process.stdout.write(formatValue(v));
}

// --- Command: read-pref ---

function cmdReadPref(args) {
  const key = args[0];
  const fallback = args[1] || '';
  if (!key) {
    process.stderr.write('Usage: kata-lib.js read-pref <key> [fallback]\n');
    process.exit(1);
  }
  const root = resolveRoot();
  const config = readJSON(path.join(root, '.planning', 'config.json'));
  const v = resolveNested(config, key) ?? DEFAULTS[key] ?? fallback ?? '';
  process.stdout.write(formatValue(v));
}

// --- Command: set-config ---

function cmdSetConfig(args) {
  const key = args[0];
  const value = args[1];
  if (!key || value === undefined) {
    process.stderr.write('Usage: kata-lib.js set-config <key> <value>\n');
    process.exit(1);
  }
  const root = resolveRoot();
  const configFile = path.join(root, '.planning', 'config.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
  catch { config = {}; }

  const parts = key.split('.');
  let obj = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in obj) || typeof obj[parts[i]] !== 'object') {
      obj[parts[i]] = {};
    }
    obj = obj[parts[i]];
  }

  let parsed;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (value !== '' && !isNaN(value)) parsed = Number(value);
  else {
    try { parsed = JSON.parse(value); }
    catch { parsed = value; }
  }
  obj[parts[parts.length - 1]] = parsed;

  const tmp = configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(tmp, configFile);
}

// --- Command: has-pref ---

function cmdHasPref(args) {
  const key = args[0];
  if (!key) {
    process.stderr.write('Usage: kata-lib.js has-pref <key>\n');
    process.exit(1);
  }
  const root = resolveRoot();
  const config = readJSON(path.join(root, '.planning', 'config.json'));
  process.exit(resolveNested(config, key) !== undefined ? 0 : 1);
}

// --- Command: check-config ---

function cmdCheckConfig() {
  const root = resolveRoot();
  const configFile = path.join(root, '.planning', 'config.json');
  if (!fs.existsSync(configFile)) process.exit(0);

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
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
  } catch {
    // Silent fail
  }
}

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

// --- Command: check-roadmap ---

function cmdCheckRoadmap() {
  const root = resolveRoot();
  const roadmap = path.join(root, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmap)) process.exit(2);

  const content = fs.readFileSync(roadmap, 'utf8');
  const hasMilestones = /^## Milestones/m.test(content);
  const hasCurrentMilestone = /^## Current Milestone:/m.test(content);
  const hasOldPhasesSection = /^## Phases$/m.test(content);

  if (hasMilestones && hasCurrentMilestone && !hasOldPhasesSection) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// --- Command: check-template-drift ---

function cmdCheckTemplateDrift() {
  let projectRoot = '';
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.planning'))) {
      projectRoot = current;
      break;
    }
    current = path.dirname(current);
  }
  if (!projectRoot) process.exit(0);

  const templatesDir = path.join(projectRoot, '.planning', 'templates');
  if (!fs.existsSync(templatesDir)) process.exit(0);

  let overrideFiles;
  try {
    overrideFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
  } catch { process.exit(0); }
  if (overrideFiles.length === 0) process.exit(0);

  // Discover sibling skills via __dirname (scripts/ -> skill/ -> skills/)
  const skillsDir = path.join(__dirname, '..', '..');

  try {
    for (const filename of overrideFiles) {
      let defaultContent = null;
      const skillDirs = fs.readdirSync(skillsDir).filter(d => d.startsWith('kata-'));
      for (const skillDir of skillDirs) {
        const defaultPath = path.join(skillsDir, skillDir, 'references', filename);
        if (fs.existsSync(defaultPath)) {
          defaultContent = fs.readFileSync(defaultPath, 'utf8');
          break;
        }
      }
      if (!defaultContent) continue;

      const required = parseSchemaComment(defaultContent);
      if (!required) continue;

      const overridePath = path.join(templatesDir, filename);
      const overrideContent = fs.readFileSync(overridePath, 'utf8');
      const missing = checkFieldPresence(overrideContent, required);

      if (missing.length > 0) {
        console.log(`[kata] Template drift: ${filename} missing required field(s): ${missing.join(', ')}. Run resolve-template.sh for defaults.`);
      }
    }
  } catch {
    // Silent fail
  }
}

function parseSimpleYAML(yamlStr) {
  const lines = yamlStr.split('\n');
  const result = { required: { frontmatter: [], body: [] } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^(\s*)/)[1].length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        if (key.trim() === 'frontmatter' && indent === 4) {
          const prevLines = lines.slice(0, i);
          const lastSection = [...prevLines].reverse().find(l => l.trim().endsWith(':'));
          if (lastSection && lastSection.includes('required')) {
            result.required.frontmatter = items;
          }
        } else if (key.trim() === 'body' && indent === 4) {
          const prevLines = lines.slice(0, i);
          const lastSection = [...prevLines].reverse().find(l => l.trim().endsWith(':'));
          if (lastSection && lastSection.includes('required')) {
            result.required.body = items;
          }
        }
      }
    }
  }
  return result;
}

function parseSchemaComment(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  try {
    const schema = parseSimpleYAML(fmMatch[1]);
    return schema.required || { frontmatter: [], body: [] };
  } catch { return null; }
}

function checkFieldPresence(content, required) {
  const missing = [];
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  for (const field of required.frontmatter) {
    const pattern = new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm');
    if (!pattern.test(bodyContent)) missing.push(field);
  }

  for (const section of required.body) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingPattern = new RegExp(`^#+\\s+${escaped}`, 'mi');
    const tagPattern = new RegExp(`<${escaped}[>\\s]`, 'i');
    if (!headingPattern.test(bodyContent) && !tagPattern.test(bodyContent) && !bodyContent.includes(section))
      missing.push(section);
  }

  return missing;
}

// --- Command: resolve-template ---

function cmdResolveTemplate(args) {
  const templateName = args[0];
  if (!templateName) {
    process.stderr.write('Usage: kata-lib.js resolve-template <template-name>\n');
    process.exit(1);
  }

  // Check project override first (walk up from CWD)
  let projectRoot = '';
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.planning'))) {
      projectRoot = current;
      break;
    }
    current = path.dirname(current);
  }

  if (projectRoot) {
    const projectTemplate = path.join(projectRoot, '.planning', 'templates', templateName);
    if (fs.existsSync(projectTemplate)) {
      process.stdout.write(projectTemplate);
      return;
    }
  }

  // Fall back to sibling skill discovery (scripts/ -> skill/ -> skills/)
  const skillsDir = path.join(__dirname, '..', '..');
  try {
    const dirs = fs.readdirSync(skillsDir).filter(d => d.startsWith('kata-'));
    for (const dir of dirs) {
      const refPath = path.join(skillsDir, dir, 'references', templateName);
      if (fs.existsSync(refPath)) {
        process.stdout.write(refPath);
        return;
      }
    }
  } catch {}

  process.stderr.write(`ERROR: Template not found: ${templateName}\n`);
  if (projectRoot) {
    process.stderr.write(`  Searched:\n`);
    process.stderr.write(`    ${path.join(projectRoot, '.planning', 'templates', templateName)} (project override)\n`);
    process.stderr.write(`    ${path.join(skillsDir, 'kata-*', 'references', templateName)} (sibling skills)\n`);
  }
  process.exit(1);
}

// --- CLI router ---

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'resolve-root':          cmdResolveRoot(); break;
  case 'read-config':           cmdReadConfig(args); break;
  case 'read-pref':             cmdReadPref(args); break;
  case 'set-config':            cmdSetConfig(args); break;
  case 'has-pref':              cmdHasPref(args); break;
  case 'check-config':          cmdCheckConfig(); break;
  case 'check-roadmap':         cmdCheckRoadmap(); break;
  case 'check-template-drift':  cmdCheckTemplateDrift(); break;
  case 'resolve-template':      cmdResolveTemplate(args); break;
  default:
    process.stderr.write(`Usage: kata-lib.js <command> [args]\n\nCommands:\n`);
    process.stderr.write(`  resolve-root                     Print project root path\n`);
    process.stderr.write(`  read-config <key> [fallback]     Read from .planning/config.json\n`);
    process.stderr.write(`  read-pref <key> [fallback]       Read with defaults cascade\n`);
    process.stderr.write(`  set-config <key> <value>         Write to config.json\n`);
    process.stderr.write(`  has-pref <key>                   Exit 0 if key exists in config\n`);
    process.stderr.write(`  check-config                     Validate config schema\n`);
    process.stderr.write(`  check-roadmap                    Check ROADMAP.md format\n`);
    process.stderr.write(`  check-template-drift             Check template overrides\n`);
    process.stderr.write(`  resolve-template <name>          Resolve template path\n`);
    process.exit(1);
}
