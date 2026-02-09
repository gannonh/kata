#!/usr/bin/env bash
# Usage: check-template-drift.sh
# Checks project template overrides for missing required fields
# Output: Warning messages to stdout
# Exit: Always 0 (warnings only, never blocks)
set -euo pipefail

# Find project root by walking up from cwd to find .planning/
CURRENT_DIR="$(pwd)"
PROJECT_ROOT=""
while [ "$CURRENT_DIR" != "/" ]; do
  if [ -d "$CURRENT_DIR/.planning" ]; then
    PROJECT_ROOT="$CURRENT_DIR"
    break
  fi
  CURRENT_DIR="$(dirname "$CURRENT_DIR")"
done

# Exit silently if no project root found
[ -n "$PROJECT_ROOT" ] || exit 0

TEMPLATES_DIR="${PROJECT_ROOT}/.planning/templates"
[ -d "$TEMPLATES_DIR" ] || exit 0

# Check for .md files
ls "$TEMPLATES_DIR"/*.md >/dev/null 2>&1 || exit 0

# Discover sibling skills directory
# Script is at skills/kata-doctor/scripts/check-template-drift.sh
# Two levels up: scripts/ -> kata-doctor/ -> skills/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

TEMPLATES_DIR="$TEMPLATES_DIR" SKILLS_DIR="$SKILLS_DIR" node << 'NODE_EOF'
const fs = require('fs');
const path = require('path');

const templatesDir = process.env.TEMPLATES_DIR;
const skillsDir = process.env.SKILLS_DIR;

function parseSimpleYAML(yamlStr) {
  const lines = yamlStr.split('\n');
  const result = { kata_template: { required: { frontmatter: [], body: [] } } };

  for (let line of lines) {
    const indent = line.match(/^(\s*)/)[1].length;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        if (key.trim() === 'frontmatter' && indent === 4) {
          const prevLines = lines.slice(0, lines.indexOf(line));
          const lastSection = prevLines.reverse().find(l => l.trim().endsWith(':'));
          if (lastSection && lastSection.includes('required')) {
            result.kata_template.required.frontmatter = items;
          }
        } else if (key.trim() === 'body' && indent === 4) {
          const prevLines = lines.slice(0, lines.indexOf(line));
          const lastSection = prevLines.reverse().find(l => l.trim().endsWith(':'));
          if (lastSection && lastSection.includes('required')) {
            result.kata_template.required.body = items;
          }
        }
      }
    }
  }

  return result.kata_template;
}

function parseSchemaComment(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  try {
    const schema = parseSimpleYAML(fmMatch[1]);
    return schema.required || { frontmatter: [], body: [] };
  } catch (e) {
    return null;
  }
}

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  return fmMatch ? fmMatch[1] : '';
}

function checkFieldPresence(content, required) {
  const missing = [];
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // For template files, required frontmatter fields should appear as examples in the body
  // (not in the template file's own frontmatter)
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

try {
  const overrideFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));

  for (const filename of overrideFiles) {
    // Find corresponding default in sibling skills
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
} catch (e) {
  // Silent fail - never block skill execution
}
NODE_EOF

exit 0
