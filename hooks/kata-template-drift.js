#!/usr/bin/env node
// Kata Template Drift Detection Hook
// Runs on SessionStart to check project template overrides for missing required fields

import fs from 'fs';
import path from 'path';

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
    if (!pattern.test(frontmatter)) {
      missing.push(field);
    }
  }

  for (const section of required.body) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingPattern = new RegExp(`^#+\\s+${escaped}`, 'mi');
    const tagPattern = new RegExp(`<${escaped}[>\\s]`, 'i');
    if (!headingPattern.test(bodyContent) && !tagPattern.test(bodyContent) && !bodyContent.includes(section)) {
      missing.push(section);
    }
  }

  return missing;
}

// Read JSON from stdin (SessionStart hook input)
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

    // Check if .planning/templates/ directory exists
    const templatesDir = path.join(cwd, '.planning', 'templates');
    if (!fs.existsSync(templatesDir) || !fs.statSync(templatesDir).isDirectory()) {
      process.exit(0); // No overrides, no drift to check
    }

    // Read all .md files in the templates directory
    const overrideFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
    if (overrideFiles.length === 0) {
      process.exit(0);
    }

    for (const filename of overrideFiles) {
      // Find the corresponding plugin default by globbing skills/kata-*/references/{filename}
      const skillsDir = path.join(pluginRoot, 'skills');
      if (!fs.existsSync(skillsDir)) continue;

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

      // Parse schema comment from plugin default
      const required = parseSchemaComment(defaultContent);
      if (!required) continue;

      // Read the project override
      const overridePath = path.join(templatesDir, filename);
      const overrideContent = fs.readFileSync(overridePath, 'utf8');

      // Check for missing fields
      const missing = checkFieldPresence(overrideContent, required);

      if (missing.length > 0) {
        console.log(`[kata] Template drift: ${filename} missing required field(s): ${missing.join(', ')}. Run resolve-template.sh for defaults.`);
      }
    }
  } catch (e) {
    // Silent fail - don't break session start
  }
});
