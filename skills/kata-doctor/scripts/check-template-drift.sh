#!/usr/bin/env bash
# Usage: check-template-drift.sh
# Checks project template overrides for missing required fields
# Output: Warning messages to stdout
# Exit: Always 0 (warnings only, never blocks)
set -euo pipefail

# Exit silently if no template overrides directory
TEMPLATES_DIR=".planning/templates"
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

function parseSchemaComment(content) {
  const match = content.match(/<!--\s*kata-template-schema\n([\s\S]*?)-->/);
  if (!match) return null;
  const schema = match[1];
  const required = { frontmatter: [], body: [] };

  const fmSection = schema.match(/required-fields:\s*\n\s*frontmatter:\s*\[([^\]]*)\]/);
  if (fmSection) {
    required.frontmatter = fmSection[1].split(',').map(f => f.trim()).filter(Boolean);
  }

  const bodySection = schema.match(/body:\s*\[([^\]]*)\]/);
  if (bodySection) {
    required.body = bodySection[1].split(',').map(f => f.trim()).filter(Boolean);
  }

  return required;
}

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  return fmMatch ? fmMatch[1] : '';
}

function checkFieldPresence(content, required) {
  const missing = [];
  const frontmatter = parseFrontmatter(content);
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  for (const field of required.frontmatter) {
    const pattern = new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm');
    if (!pattern.test(frontmatter)) missing.push(field);
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
