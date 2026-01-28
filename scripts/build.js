#!/usr/bin/env node

/**
 * Build script for Kata plugin distribution.
 *
 * Builds the Claude Code marketplace plugin (/plugin install)
 * - Path transform: subagent_type="kata-xxx" → subagent_type="kata:kata-xxx"
 * - Output: dist/plugin/
 *
 * Usage:
 *   node scripts/build.js [plugin]   # Build plugin (default)
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
  'commands/kata',
  'skills',
  'agents',
  'hooks',
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
  'scripts',
  'node_modules',
  '.secrets',
  '.github',
  'assets',
  'dist',
  '.DS_Store',
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
    // Skip hooks/dist - it's for npm publishing only
    if (entry.name === 'dist' && src.includes('hooks')) continue;

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
 * Plugin agents are namespaced by Claude Code as pluginname:agentname,
 * so kata-executor becomes kata:kata-executor in plugin context.
 *
 * Skill() invocations use kata:skillname format directly in source
 * (no transformation needed).
 */
function transformPluginPaths(content) {
  // Transform agent references: subagent_type="kata-xxx" → subagent_type="kata:kata-xxx"
  content = content.replace(/subagent_type="kata-/g, 'subagent_type="kata:kata-');

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
  const requiredDirs = ['agents', 'skills'];
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

    console.log(`  ${green}+${reset} Copied skills/${entry.name}`);
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
      console.log(`  ${green}+${reset} Copied ${item}`);
    }
  }

  // Copy plugin-specific files
  for (const item of PLUGIN_INCLUDES) {
    if (copyPath(item, dest)) {
      console.log(`  ${green}+${reset} Copied ${item}`);
    }
  }

  // Write VERSION file
  writeVersion(dest);
  console.log(`  ${green}+${reset} Wrote VERSION (${pkg.version})`);

  // Validate build
  const errors = validateBuild(dest);
  if (errors.length > 0) {
    console.log(`\n${red}Validation errors:${reset}`);
    for (const error of errors) {
      console.log(`  ${red}x${reset} ${error}`);
    }
    return false;
  }

  console.log(`\n${green}+ Plugin build complete: dist/plugin/${reset}`);
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

  if (target !== 'plugin' && target !== 'all') {
    console.error(`${red}Unknown target: ${target}${reset}`);
    console.log(`\nUsage: node scripts/build.js [plugin]`);
    process.exit(1);
  }

  const success = buildPlugin();
  if (!success) {
    process.exit(1);
  }

  console.log(`\n${green}Build complete!${reset}\n`);
}

main();
