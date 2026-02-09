#!/usr/bin/env bash
# Usage: list-templates.sh
# Discovers all schema-backed templates from sibling skill directories
# Output: JSON array of template metadata to stdout
# Exit: Always 0
set -euo pipefail

# Sibling discovery: scripts/ -> kata-customize/ -> skills/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

SKILLS_DIR="$SKILLS_DIR" node << 'NODE_EOF'
const fs = require('fs');
const path = require('path');

function parseSimpleYAML(yamlStr) {
  // Minimal YAML parser for our specific schema structure
  const lines = yamlStr.split('\n');
  const result = { kata_template: { name: '', required: {}, optional: {} } };

  for (let line of lines) {
    const indent = line.match(/^(\s*)/)[1].length;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      // Handle arrays like [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        if (key.trim() === 'frontmatter' && indent === 4) {
          // Figure out if it's required or optional based on context
          const prevLines = lines.slice(0, lines.indexOf(line));
          const lastSection = prevLines.reverse().find(l => l.trim().endsWith(':'));
          if (lastSection && lastSection.includes('required')) {
            result.kata_template.required.frontmatter = items;
          } else if (lastSection && lastSection.includes('optional')) {
            result.kata_template.optional.frontmatter = items;
          }
        } else if (key.trim() === 'body' && indent === 4) {
          const prevLines = lines.slice(0, lines.indexOf(line));
          const lastSection = prevLines.reverse().find(l => l.trim().endsWith(':'));
          if (lastSection && lastSection.includes('required')) {
            result.kata_template.required.body = items;
          } else if (lastSection && lastSection.includes('optional')) {
            result.kata_template.optional.body = items;
          }
        }
      } else if (key.trim() === 'name' && indent === 2) {
        result.kata_template.name = value.replace(/['"]/g, '');
      }
    }
  }

  return result;
}

function extractSchema(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  try {
    return parseSimpleYAML(fmMatch[1]);
  } catch (e) {
    return null;
  }
}

try {
  const skillsDir = process.env.SKILLS_DIR;
  const templates = [];
  const skillDirs = fs.readdirSync(skillsDir).filter(d => d.startsWith('kata-'));

  // Find project root by walking up from cwd looking for .planning/
  let projectRoot = null;
  let currentDir = process.cwd();
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, '.planning'))) {
      projectRoot = currentDir;
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  for (const skillDir of skillDirs) {
    const refsDir = path.join(skillsDir, skillDir, 'references');
    if (!fs.existsSync(refsDir)) continue;

    const files = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
    for (const filename of files) {
      const filePath = path.join(refsDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');

      const schema = extractSchema(content);
      if (!schema || !schema.kata_template) continue;

      const kt = schema.kata_template;
      const description = kt.name || filename;

      // Check if project override exists (only if we found project root)
      const hasOverride = projectRoot && fs.existsSync(path.join(projectRoot, '.planning', 'templates', filename));

      templates.push({
        filename,
        skill: skillDir,
        description,
        hasOverride,
        required: {
          frontmatter: kt.required?.frontmatter || [],
          body: kt.required?.body || []
        },
        optional: {
          frontmatter: kt.optional?.frontmatter || [],
          body: kt.optional?.body || []
        }
      });
    }
  }

  console.log(JSON.stringify(templates, null, 2));
} catch (e) {
  console.log('[]');
}
NODE_EOF

exit 0
