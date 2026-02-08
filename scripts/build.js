#!/usr/bin/env node

/**
 * Build script for Kata distribution targets.
 *
 * Targets:
 *   plugin     - Claude Code marketplace plugin (/plugin install) → dist/plugin/
 *   skills-sh  - skills.sh distribution (skills only) → dist/skills-sh/
 *   all        - Build all targets
 *
 * Usage:
 *   node scripts/build.js [plugin|skills-sh|all]   # Default: plugin
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.dirname(__dirname);

// ANSI colors
const green = '\x1b[32m';
const amber = '\x1b[33m';
const red = '\x1b[31m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

// Get version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/**
 * Files/directories to include in the distribution
 */
const INCLUDES = [
  'skills',
  'CHANGELOG.md',
];

/**
 * Files/directories to exclude from copy operations
 */
const EXCLUDES = [
  '.planning',
  'tests',
  '.git',
  'dev',
  'node_modules',
  '.secrets',
  '.github',
  'assets',
  'dist',
  '.DS_Store',
  '__pycache__',
  // Note: 'scripts' removed - top-level scripts/ isn't in INCLUDES anyway,
  // and we need skills/*/scripts/ to be copied for skill helper scripts
];

/**
 * Plugin-specific includes
 */
const PLUGIN_INCLUDES = [
  '.claude-plugin',
];

/**
 * Clean a directory (remove and recreate)
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Check if path should be excluded
 */
function shouldExclude(name) {
  return EXCLUDES.includes(name) || name.startsWith('.');
}

/**
 * Copy a file, optionally transforming paths in .md files
 */
function copyFile(src, dest, transform = null) {
  const content = fs.readFileSync(src, 'utf8');
  if (transform && src.endsWith('.md')) {
    fs.writeFileSync(dest, transform(content));
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Recursively copy a directory with optional path transformation
 */
function copyDir(src, dest, transform = null) {
  if (!fs.existsSync(src)) {
    console.log(`  ${amber}!${reset} Skipping ${src} (not found)`);
    return false;
  }

  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    // Skip excluded files/directories
    if (shouldExclude(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, transform);
    } else {
      copyFile(srcPath, destPath, transform);
    }
  }
  return true;
}

/**
 * Copy a file or directory to destination
 */
function copyPath(src, dest, transform = null) {
  const srcPath = path.join(ROOT, src);
  const destPath = path.join(dest, src);

  if (!fs.existsSync(srcPath)) {
    console.log(`  ${amber}!${reset} Skipping ${src} (not found)`);
    return false;
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    return copyDir(srcPath, destPath, transform);
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    copyFile(srcPath, destPath, transform);
    return true;
  }
}

/**
 * Transform references for plugin distribution
 *
 * No path transforms needed for plugin distribution.
 */
function transformPluginPaths(content) {
  return content;
}

/**
 * Write VERSION file
 */
function writeVersion(dest) {
  const versionPath = path.join(dest, 'VERSION');
  fs.writeFileSync(versionPath, pkg.version);
}

/**
 * Validate build output
 */
function validateBuild(dest) {
  const errors = [];

  // Check required directories exist
  const requiredDirs = ['skills'];
  for (const dir of requiredDirs) {
    const dirPath = path.join(dest, dir);
    if (!fs.existsSync(dirPath)) {
      errors.push(`Missing directory: ${dir}`);
    }
  }

  // Verify no ~/.claude/ references remain in executable files
  // Excludes CHANGELOG.md which contains historical documentation
  const checkForOldPaths = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        checkForOldPaths(fullPath);
      } else if (entry.name.endsWith('.md') && entry.name !== 'CHANGELOG.md') {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('@~/.claude/')) {
          errors.push(`Old path reference in ${fullPath.replace(dest, '')}`);
        }
      }
    }
  };
  checkForOldPaths(dest);

  return errors;
}

/**
 * Copy skills directory for plugin distribution
 */
function copySkillsForPlugin(dest) {
  const srcDir = path.join(ROOT, 'skills');
  const destDir = path.join(dest, 'skills');

  if (!fs.existsSync(srcDir)) {
    console.log(`  ${amber}!${reset} Skipping skills (not found)`);
    return false;
  }

  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (shouldExclude(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    // Copy skill directory contents with transforms
    fs.mkdirSync(destPath, { recursive: true });
    copySkillContents(srcPath, destPath);

    console.log(`  ${green}✓${reset} Copied skills/${entry.name}`);
  }

  return true;
}

/**
 * Copy skill directory contents with transforms
 */
function copySkillContents(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldExclude(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copySkillContents(srcPath, destPath);
    } else if (entry.name.endsWith('.md')) {
      // Apply plugin path transform
      const content = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(destPath, transformPluginPaths(content));
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Build plugin distribution
 */
function buildPlugin() {
  console.log(`\n${green}Building plugin distribution...${reset}\n`);

  const dest = path.join(ROOT, 'dist', 'plugin');
  cleanDir(dest);

  // Copy skills with path transformation
  copySkillsForPlugin(dest);

  // Copy other files with path transformation
  for (const item of INCLUDES) {
    // Skip skills - handled above
    if (item === 'skills') continue;
    if (copyPath(item, dest, transformPluginPaths)) {
      console.log(`  ${green}✓${reset} Copied ${item}`);
    }
  }

  // Copy plugin-specific files
  for (const item of PLUGIN_INCLUDES) {
    if (copyPath(item, dest)) {
      console.log(`  ${green}✓${reset} Copied ${item}`);
    }
  }

  // Write VERSION file
  writeVersion(dest);
  console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);

  // Validate build
  const errors = validateBuild(dest);
  if (errors.length > 0) {
    console.log(`\n${red}Validation errors:${reset}`);
    for (const error of errors) {
      console.log(`  ${red}x${reset} ${error}`);
    }
    return false;
  }

  console.log(`\n${green}✓ Plugin build complete: dist/plugin/${reset}`);
  return true;
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Returns object with name and description, or null if no frontmatter.
 */
function parseSkillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Strip surrounding quotes
      value = value.replace(/^["']|["']$/g, '');
      frontmatter[key] = value;
    }
  }
  return frontmatter;
}

/**
 * Build skills-sh distribution (skills.sh registry)
 */
function buildSkillsSh() {
  console.log(`\n${green}Building skills-sh distribution...${reset}\n`);

  const dest = path.join(ROOT, 'dist', 'skills-sh');
  cleanDir(dest);

  // Copy skills directory
  const srcSkills = path.join(ROOT, 'skills');
  const destSkills = path.join(dest, 'skills');
  if (!copyDir(srcSkills, destSkills)) {
    console.log(`  ${red}x${reset} Failed to copy skills directory`);
    return false;
  }

  // Count skills
  const skillDirs = fs.readdirSync(destSkills, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('kata-'));
  console.log(`  ${green}✓${reset} Copied ${skillDirs.length} skills`);

  // Generate README.md from skill metadata
  const skillRows = [];
  for (const entry of skillDirs) {
    const skillMdPath = path.join(srcSkills, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const fm = parseSkillFrontmatter(content);
    if (!fm || !fm.name) continue;
    let desc = fm.description || '';
    // Strip "Triggers include..." suffix (Claude Code-specific)
    desc = desc.replace(/\s*Triggers include.*$/, '');
    // Ensure description ends with period
    if (desc && !desc.endsWith('.')) desc += '.';
    skillRows.push(`| ${fm.name} | ${desc} |`);
  }

  const readme = `# Kata Skills

Spec-driven development framework for Claude Code.

## Install

\`\`\`bash
npx skills add gannonh/kata-skills
\`\`\`

## Skills

| Skill | Description |
|-------|-------------|
${skillRows.join('\n')}

## License

MIT
`;

  fs.writeFileSync(path.join(dest, 'README.md'), readme);
  console.log(`  ${green}✓${reset} Generated README.md`);

  // Generate LICENSE
  const license = `MIT License

Copyright (c) 2026 gannonh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

  fs.writeFileSync(path.join(dest, 'LICENSE'), license);
  console.log(`  ${green}✓${reset} Generated LICENSE`);

  // Validate
  const errors = [];
  if (!fs.existsSync(destSkills)) errors.push('Missing directory: skills');
  if (!fs.existsSync(path.join(dest, 'README.md'))) errors.push('Missing file: README.md');
  if (!fs.existsSync(path.join(dest, 'LICENSE'))) errors.push('Missing file: LICENSE');

  if (errors.length > 0) {
    console.log(`\n${red}Validation errors:${reset}`);
    for (const error of errors) {
      console.log(`  ${red}x${reset} ${error}`);
    }
    return false;
  }

  console.log(`\n${green}✓ Skills-sh build complete: dist/skills-sh/ (${skillDirs.length} skills)${reset}`);
  return true;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'plugin';

  console.log(`${amber}Kata Build System${reset}`);
  console.log(`${dim}Version: ${pkg.version}${reset}`);

  const validTargets = ['plugin', 'skills-sh', 'all'];
  if (!validTargets.includes(target)) {
    console.error(`${red}Unknown target: ${target}${reset}`);
    console.log(`\nUsage: node scripts/build.js [plugin|skills-sh|all]`);
    process.exit(1);
  }

  let success = true;

  if (target === 'plugin' || target === 'all') {
    success = buildPlugin();
  }
  if (target === 'skills-sh' || target === 'all') {
    success = buildSkillsSh() && success;
  }

  if (!success) {
    process.exit(1);
  }

  console.log(`\n${green}Build complete!${reset}\n`);
}

main();
