#!/usr/bin/env node

/**
 * Build script for Kata dual distribution.
 *
 * Targets:
 * - plugin: Lean distribution for Claude Code marketplace (/plugin install)
 *   - Path transform: @~/.claude/kata/ → @./kata/
 *   - Output: dist/plugin/
 *
 * - npm: Distribution via npx @gannonh/kata
 *   - No path transform (install.js handles at runtime)
 *   - Output: dist/npm/
 *
 * Usage:
 *   node scripts/build.js plugin   # Build plugin only
 *   node scripts/build.js npm      # Build npm only
 *   node scripts/build.js all      # Build both (default)
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
 * Files/directories to include in both distributions
 */
const COMMON_INCLUDES = [
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
 * Files/directories to exclude from PLUGIN distribution only
 * (these are NPM-specific and don't work in plugin context)
 */
const PLUGIN_EXCLUDES = [
  'commands/kata/update.md',
  'skills/kata-updating',
];

/**
 * Plugin-specific includes
 */
const PLUGIN_INCLUDES = [
  '.claude-plugin',
];

/**
 * NPM-specific includes
 */
const NPM_INCLUDES = [
  'bin',
  'package.json',
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
 * Check if path should be excluded from plugin build
 * @param {string} relativePath - Path relative to source root
 */
function shouldExcludeFromPlugin(relativePath) {
  return PLUGIN_EXCLUDES.some(excluded =>
    relativePath === excluded || relativePath.startsWith(excluded + '/')
  );
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
function copyDir(src, dest, transform = null, excludeFilter = null) {
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

    // Check plugin-specific exclusions using relative path from ROOT
    if (excludeFilter) {
      const relativePath = path.relative(ROOT, srcPath);
      if (excludeFilter(relativePath)) {
        console.log(`  ${dim}-${reset} Excluded ${relativePath} (plugin-specific)`);
        continue;
      }
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, transform, excludeFilter);
    } else {
      copyFile(srcPath, destPath, transform);
    }
  }
  return true;
}

/**
 * Copy a file or directory to destination
 */
function copyPath(src, dest, transform = null, excludeFilter = null) {
  const srcPath = path.join(ROOT, src);
  const destPath = path.join(dest, src);

  // Check if this specific path should be excluded
  if (excludeFilter && excludeFilter(src)) {
    console.log(`  ${dim}-${reset} Excluded ${src} (plugin-specific)`);
    return true; // Return true to not trigger "not found" warning
  }

  if (!fs.existsSync(srcPath)) {
    console.log(`  ${amber}!${reset} Skipping ${src} (not found)`);
    return false;
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    return copyDir(srcPath, destPath, transform, excludeFilter);
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
 * Plugin skills are namespaced as pluginname:skillname. Since skill
 * directories are renamed (kata-xxx → xxx), Skill() invocations need
 * to be transformed from Skill("kata-xxx") to Skill("kata:xxx").
 *
 * Note: @~/.claude/kata/ path transformation removed in v1.0.6 Phase 2.1.
 * Skills now use relative paths to bundled resources.
 */
function transformPluginPaths(content) {
  // Transform agent references: subagent_type="kata-xxx" → subagent_type="kata:kata-xxx"
  content = content.replace(/subagent_type="kata-/g, 'subagent_type="kata:kata-');

  // Transform Skill invocations: Skill("kata-xxx") → Skill("kata:xxx")
  // Skill dirs renamed kata-xxx → xxx, so plugin skill name is kata:xxx
  content = content.replace(/Skill\("kata-/g, 'Skill("kata:');

  return content;
}

/**
 * Transform skill name in SKILL.md frontmatter for plugin distribution
 *
 * Plugin skills are namespaced by Claude Code as pluginname:skillname,
 * so kata-adding-phases becomes kata:adding-phases in plugin context.
 * We strip the kata- prefix from the name field to avoid double-prefixing.
 */
function transformSkillName(content) {
  return content.replace(/^(name:\s*)kata-/m, '$1');
}

/**
 * Rename skill directory for plugin distribution
 *
 * Strips kata- prefix from skill directories so they're accessible
 * as kata:skill-name instead of kata:kata-skill-name
 */
function renameSkillDir(name) {
  if (name.startsWith('kata-')) {
    return name.slice(5);  // Remove 'kata-' (5 chars)
  }
  return name;
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
function validateBuild(dest, target) {
  const errors = [];

  // Check required directories exist
  const requiredDirs = ['agents', 'skills'];
  for (const dir of requiredDirs) {
    const dirPath = path.join(dest, dir);
    if (!fs.existsSync(dirPath)) {
      errors.push(`Missing directory: ${dir}`);
    }
  }

  // For plugin target, verify no ~/.claude/ references remain in executable files
  // Excludes CHANGELOG.md which contains historical documentation
  if (target === 'plugin') {
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

    // Verify excluded files are not present
    for (const excluded of PLUGIN_EXCLUDES) {
      const fullPath = path.join(dest, excluded);
      if (fs.existsSync(fullPath)) {
        errors.push(`Plugin build should not include: ${excluded}`);
      }
    }
  }

  // For npm target, verify install.js exists
  if (target === 'npm') {
    const installPath = path.join(dest, 'bin', 'install.js');
    if (!fs.existsSync(installPath)) {
      errors.push('Missing bin/install.js');
    }
  }

  return errors;
}

/**
 * Copy skills directory with special handling for plugin distribution:
 * - Rename skill directories (strip kata- prefix)
 * - Transform SKILL.md name field (strip kata- prefix)
 * - Apply standard plugin path transforms
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

    // Check plugin-specific exclusions
    const relativePath = `skills/${entry.name}`;
    if (shouldExcludeFromPlugin(relativePath)) {
      console.log(`  ${dim}-${reset} Excluded ${relativePath} (plugin-specific)`);
      continue;
    }

    // Rename directory: kata-adding-phases -> adding-phases
    const newDirName = renameSkillDir(entry.name);
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, newDirName);

    // Copy skill directory contents
    fs.mkdirSync(destPath, { recursive: true });
    copySkillContents(srcPath, destPath);

    if (entry.name !== newDirName) {
      console.log(`  ${green}✓${reset} Copied skills/${entry.name} → skills/${newDirName}`);
    } else {
      console.log(`  ${green}✓${reset} Copied skills/${entry.name}`);
    }
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
    } else if (entry.name === 'SKILL.md') {
      // Apply both skill name transform and plugin path transform
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transformSkillName(content);
      content = transformPluginPaths(content);
      fs.writeFileSync(destPath, content);
    } else if (entry.name.endsWith('.md')) {
      // Apply plugin path transform only
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

  // Copy skills with special handling (rename dirs, transform names)
  copySkillsForPlugin(dest);

  // Copy other common files with path transformation AND plugin exclusions
  for (const item of COMMON_INCLUDES) {
    // Skip skills - handled above
    if (item === 'skills') continue;
    if (copyPath(item, dest, transformPluginPaths, shouldExcludeFromPlugin)) {
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
  const errors = validateBuild(dest, 'plugin');
  if (errors.length > 0) {
    console.log(`\n${red}Validation errors:${reset}`);
    for (const error of errors) {
      console.log(`  ${red}✗${reset} ${error}`);
    }
    return false;
  }

  console.log(`\n${green}✓ Plugin build complete: dist/plugin/${reset}`);
  return true;
}

/**
 * Build npm distribution
 */
function buildNpm() {
  console.log(`\n${green}Building npm distribution...${reset}\n`);

  const dest = path.join(ROOT, 'dist', 'npm');
  cleanDir(dest);

  // Copy common files (no path transformation - install.js handles it)
  for (const item of COMMON_INCLUDES) {
    if (copyPath(item, dest)) {
      console.log(`  ${green}✓${reset} Copied ${item}`);
    }
  }

  // Copy npm-specific files
  for (const item of NPM_INCLUDES) {
    if (copyPath(item, dest)) {
      console.log(`  ${green}✓${reset} Copied ${item}`);
    }
  }

  // Clean up package.json for distribution (remove dev scripts)
  const distPkgPath = path.join(dest, 'package.json');
  if (fs.existsSync(distPkgPath)) {
    const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
    // Remove kata from files since it doesn't exist in npm distribution
    if (distPkg.files) {
      distPkg.files = distPkg.files.filter(f => f !== 'kata');
    }
    // Remove scripts that don't work in dist context
    delete distPkg.scripts.prepublishOnly;
    delete distPkg.scripts.build;
    delete distPkg.scripts['build:plugin'];
    delete distPkg.scripts['build:npm'];
    delete distPkg.scripts['build:hooks'];
    delete distPkg.scripts.test;
    delete distPkg.scripts['test:build'];
    fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2) + '\n');
    console.log(`  ${green}✓${reset} Cleaned package.json scripts`);
  }

  // Write VERSION file
  writeVersion(dest);
  console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`)

  // Validate build
  const errors = validateBuild(dest, 'npm');
  if (errors.length > 0) {
    console.log(`\n${red}Validation errors:${reset}`);
    for (const error of errors) {
      console.log(`  ${red}✗${reset} ${error}`);
    }
    return false;
  }

  console.log(`\n${green}✓ npm build complete: dist/npm/${reset}`);
  return true;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  console.log(`${amber}Kata Build System${reset}`);
  console.log(`${dim}Version: ${pkg.version}${reset}`);

  let success = true;

  switch (target) {
    case 'plugin':
      success = buildPlugin();
      break;
    case 'npm':
      success = buildNpm();
      break;
    case 'all':
      success = buildPlugin() && buildNpm();
      break;
    default:
      console.error(`${red}Unknown target: ${target}${reset}`);
      console.log(`\nUsage: node scripts/build.js [plugin|npm|all]`);
      process.exit(1);
  }

  if (!success) {
    process.exit(1);
  }

  console.log(`\n${green}Build complete!${reset}\n`);
}

main();
