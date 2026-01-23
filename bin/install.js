#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors - using standard ANSI for max terminal compatibility
const amber = '\x1b[33m';       // Yellow - brand accent
const green = '\x1b[32m';       // Green - success
const red = '\x1b[31m';         // Red - errors
const bold = '\x1b[1m';         // Bold
const dim = '\x1b[2m';          // Dim
const reset = '\x1b[0m';

// Get version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const banner = `
${amber}  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │    ██╗  ██╗ █████╗ ████████╗ █████╗       ╔═══════╗      │
  │    ██║ ██╔╝██╔══██╗╚══██╔══╝██╔══██╗      ║ ═╦═   ║      │
  │    █████╔╝ ███████║   ██║   ███████║      ╠══╬══╦═╣      │
  │    ██╔═██╗ ██╔══██║   ██║   ██╔══██║      ║  ║  ╠═╣      │
  │    ██║  ██╗██║  ██║   ██║   ██║  ██║      ╚══╩══╩═╝      │
  │    ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝        型           │
  │                                                          │
  └──────────────────────────────────────────────────────────┘${reset}
  ${dim}v${pkg.version} · agent orchestration framework${reset}
`;

// Parse args
const args = process.argv.slice(2);
const hasGlobal = args.includes('--global') || args.includes('-g');
const hasLocal = args.includes('--local') || args.includes('-l');

// Parse --config-dir argument
function parseConfigDirArg() {
  const configDirIndex = args.findIndex(arg => arg === '--config-dir' || arg === '-c');
  if (configDirIndex !== -1) {
    const nextArg = args[configDirIndex + 1];
    // Error if --config-dir is provided without a value or next arg is another flag
    if (!nextArg || nextArg.startsWith('-')) {
      console.error(`  ${amber}--config-dir requires a path argument${reset}`);
      process.exit(1);
    }
    return nextArg;
  }
  // Also handle --config-dir=value format
  const configDirArg = args.find(arg => arg.startsWith('--config-dir=') || arg.startsWith('-c='));
  if (configDirArg) {
    return configDirArg.split('=')[1];
  }
  return null;
}
const explicitConfigDir = parseConfigDirArg();
const hasHelp = args.includes('--help') || args.includes('-h');

console.log(banner);

// Show help if requested
if (hasHelp) {
  console.log(`  ${amber}Usage:${reset} npx @gannonh/kata [options]

  ${amber}Options:${reset}
    ${amber}-g, --global${reset}              Install globally (to Claude config directory)
    ${amber}-l, --local${reset}               Install locally (to ./.claude in current directory)
    ${amber}-c, --config-dir <path>${reset}   Specify custom Claude config directory
    ${amber}-h, --help${reset}                Show this help message

  ${amber}Examples:${reset}
    ${dim}# Install to default ~/.claude directory${reset}
    npx @gannonh/kata --global

    ${dim}# Install to custom config directory (for multiple Claude accounts)${reset}
    npx @gannonh/kata --global --config-dir ~/.claude-bc

    ${dim}# Using environment variable${reset}
    CLAUDE_CONFIG_DIR=~/.claude-bc npx @gannonh/kata --global

    ${dim}# Install to current project only${reset}
    npx @gannonh/kata --local

  ${amber}Notes:${reset}
    The --config-dir option is useful when you have multiple Claude Code
    configurations (e.g., for different subscriptions). It takes priority
    over the CLAUDE_CONFIG_DIR environment variable.
`);
  process.exit(0);
}

/**
 * Expand ~ to home directory (shell doesn't expand in env vars passed to node)
 */
function expandTilde(filePath) {
  if (filePath && filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Read and parse settings.json, returning empty object if doesn't exist
 */
function readSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Write settings.json with proper formatting
 */
function writeSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Recursively copy directory, replacing paths in .md files
 * Deletes existing destDir first to remove orphaned files from previous versions
 */
function copyWithPathReplacement(srcDir, destDir, pathPrefix) {
  // Clean install: remove existing destination to prevent orphaned files
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyWithPathReplacement(srcPath, destPath, pathPrefix);
    } else if (entry.name.endsWith('.md')) {
      // Replace ~/.claude/ with the appropriate prefix in markdown files
      let content = fs.readFileSync(srcPath, 'utf8');
      content = content.replace(/~\/\.claude\//g, pathPrefix);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clean up orphaned files from previous Kata versions
 */
function cleanupOrphanedFiles(claudeDir) {
  const orphanedFiles = [
    'hooks/gsd-notify.sh',   // Removed in v1.6.x
    'hooks/kata-lint.js',    // Dev-only, erroneously distributed in v1.7.x
    'hooks/statusline.js',   // Renamed to kata-npm-statusline.js
  ];

  const orphanedDirs = [
    // Removed: 'commands/kata' - commands are now part of the distribution
  ];

  for (const relPath of orphanedFiles) {
    const fullPath = path.join(claudeDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ${green}✓${reset} Removed orphaned ${relPath}`);
    }
  }

  for (const relPath of orphanedDirs) {
    const fullPath = path.join(claudeDir, relPath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true });
      console.log(`  ${green}✓${reset} Removed orphaned ${relPath}`);
    }
  }
}

/**
 * Clean up orphaned hook registrations from settings.json
 */
function cleanupOrphanedHooks(settings) {
  const orphanedHookPatterns = [
    'gsd-notify.sh',  // Removed in v1.6.x
  ];

  let cleaned = false;

  // Check all hook event types (Stop, SessionStart, etc.)
  if (settings.hooks) {
    for (const eventType of Object.keys(settings.hooks)) {
      const hookEntries = settings.hooks[eventType];
      if (Array.isArray(hookEntries)) {
        // Filter out entries that contain orphaned hooks
        const filtered = hookEntries.filter(entry => {
          if (entry.hooks && Array.isArray(entry.hooks)) {
            // Check if any hook in this entry matches orphaned patterns
            const hasOrphaned = entry.hooks.some(h =>
              h.command && orphanedHookPatterns.some(pattern => h.command.includes(pattern))
            );
            if (hasOrphaned) {
              cleaned = true;
              return false;  // Remove this entry
            }
          }
          return true;  // Keep this entry
        });
        settings.hooks[eventType] = filtered;
      }
    }
  }

  if (cleaned) {
    console.log(`  ${green}✓${reset} Removed orphaned hook registrations`);
  }

  return settings;
}

/**
 * Verify a directory exists and contains files
 */
function verifyInstalled(dirPath, description) {
  if (!fs.existsSync(dirPath)) {
    console.error(`  ${amber}✗${reset} Failed to install ${description}: directory not created`);
    return false;
  }
  try {
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      console.error(`  ${amber}✗${reset} Failed to install ${description}: directory is empty`);
      return false;
    }
  } catch (e) {
    console.error(`  ${amber}✗${reset} Failed to install ${description}: ${e.message}`);
    return false;
  }
  return true;
}

/**
 * Verify a file exists
 */
function verifyFileInstalled(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`  ${amber}✗${reset} Failed to install ${description}: file not created`);
    return false;
  }
  return true;
}

/**
 * Install to the specified directory
 */
function install(isGlobal) {
  const src = path.join(__dirname, '..');
  // Priority: explicit --config-dir arg > CLAUDE_CONFIG_DIR env var > default ~/.claude
  const configDir = expandTilde(explicitConfigDir) || expandTilde(process.env.CLAUDE_CONFIG_DIR);
  const defaultGlobalDir = configDir || path.join(os.homedir(), '.claude');
  const claudeDir = isGlobal
    ? defaultGlobalDir
    : path.join(process.cwd(), '.claude');

  const locationLabel = isGlobal
    ? claudeDir.replace(os.homedir(), '~')
    : claudeDir.replace(process.cwd(), '.');

  // Path prefix for file references
  // Use actual path when CLAUDE_CONFIG_DIR is set, otherwise use ~ shorthand
  const pathPrefix = isGlobal
    ? (configDir ? `${claudeDir}/` : '~/.claude/')
    : './.claude/';

  console.log(`  Installing to ${amber}${locationLabel}${reset}\n`);

  // Track installation failures
  const failures = [];

  // Clean up orphaned files from previous versions
  cleanupOrphanedFiles(claudeDir);

  // Copy kata skill with path replacement
  const skillSrc = path.join(src, 'kata');
  const skillDest = path.join(claudeDir, 'kata');
  copyWithPathReplacement(skillSrc, skillDest, pathPrefix);
  if (verifyInstalled(skillDest, 'kata')) {
    console.log(`  ${green}✓${reset} Installed kata`);
  } else {
    failures.push('kata');
  }

  // Copy agents to ~/.claude/agents (subagents must be at root level)
  // Only delete gsd-*.md files to preserve user's custom agents
  const agentsSrc = path.join(src, 'agents');
  if (fs.existsSync(agentsSrc)) {
    const agentsDest = path.join(claudeDir, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });

    // Remove old Kata agents (kata-*.md and gsd-*.md for migration) before copying new ones
    if (fs.existsSync(agentsDest)) {
      for (const file of fs.readdirSync(agentsDest)) {
        if ((file.startsWith('kata-') || file.startsWith('gsd-')) && file.endsWith('.md')) {
          fs.unlinkSync(path.join(agentsDest, file));
        }
      }
    }

    // Copy new agents (don't use copyWithPathReplacement which would wipe the folder)
    const agentEntries = fs.readdirSync(agentsSrc, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        let content = fs.readFileSync(path.join(agentsSrc, entry.name), 'utf8');
        content = content.replace(/~\/\.claude\//g, pathPrefix);
        fs.writeFileSync(path.join(agentsDest, entry.name), content);
      }
    }
    if (verifyInstalled(agentsDest, 'agents')) {
      console.log(`  ${green}✓${reset} Installed agents`);
    } else {
      failures.push('agents');
    }
  }

  // Copy skills to ~/.claude/skills (skill directories must be at root level)
  const skillsSrc = path.join(src, 'skills');
  if (fs.existsSync(skillsSrc)) {
    const skillsDest = path.join(claudeDir, 'skills');
    fs.mkdirSync(skillsDest, { recursive: true });

    // Remove old Kata skills (kata-*) before copying new ones
    if (fs.existsSync(skillsDest)) {
      for (const dir of fs.readdirSync(skillsDest)) {
        const dirPath = path.join(skillsDest, dir);
        if (dir.startsWith('kata-') && fs.statSync(dirPath).isDirectory()) {
          fs.rmSync(dirPath, { recursive: true });
        }
      }
    }

    // Copy each skill directory with path replacement
    const skillEntries = fs.readdirSync(skillsSrc, { withFileTypes: true });
    for (const entry of skillEntries) {
      if (entry.isDirectory()) {
        const skillSrc = path.join(skillsSrc, entry.name);
        const skillDest = path.join(skillsDest, entry.name);
        copyWithPathReplacement(skillSrc, skillDest, pathPrefix);
      }
    }
    if (verifyInstalled(skillsDest, 'skills')) {
      console.log(`  ${green}✓${reset} Installed skills`);
    } else {
      failures.push('skills');
    }
  }

  // Copy CHANGELOG.md
  const changelogSrc = path.join(src, 'CHANGELOG.md');
  const changelogDest = path.join(claudeDir, 'kata', 'CHANGELOG.md');
  if (fs.existsSync(changelogSrc)) {
    fs.copyFileSync(changelogSrc, changelogDest);
    if (verifyFileInstalled(changelogDest, 'CHANGELOG.md')) {
      console.log(`  ${green}✓${reset} Installed CHANGELOG.md`);
    } else {
      failures.push('CHANGELOG.md');
    }
  }

  // Write VERSION file for whats-new command
  const versionDest = path.join(claudeDir, 'kata', 'VERSION');
  fs.writeFileSync(versionDest, pkg.version);
  if (verifyFileInstalled(versionDest, 'VERSION')) {
    console.log(`  ${green}✓${reset} Wrote VERSION (${pkg.version})`);
  } else {
    failures.push('VERSION');
  }

  // Copy commands to ~/.claude/commands (slash commands for explicit invocation)
  const commandsSrc = path.join(src, 'commands');
  if (fs.existsSync(commandsSrc)) {
    const commandsDest = path.join(claudeDir, 'commands');

    // Remove old kata commands before copying new ones
    const kataCommandsDest = path.join(commandsDest, 'kata');
    if (fs.existsSync(kataCommandsDest)) {
      fs.rmSync(kataCommandsDest, { recursive: true });
    }

    // Copy commands/kata directory with path replacement
    const kataCommandsSrc = path.join(commandsSrc, 'kata');
    if (fs.existsSync(kataCommandsSrc)) {
      copyWithPathReplacement(kataCommandsSrc, kataCommandsDest, pathPrefix);
    }

    if (verifyInstalled(kataCommandsDest, 'commands')) {
      console.log(`  ${green}✓${reset} Installed commands`);
    } else {
      failures.push('commands');
    }
  }

  // Copy hooks (recursively to handle subdirectories like dist/)
  const hooksSrc = path.join(src, 'hooks');
  if (fs.existsSync(hooksSrc)) {
    const hooksDest = path.join(claudeDir, 'hooks');
    // Clean install: remove existing to prevent orphaned files
    if (fs.existsSync(hooksDest)) {
      fs.rmSync(hooksDest, { recursive: true });
    }
    fs.mkdirSync(hooksDest, { recursive: true });

    function copyHooksRecursive(srcDir, destDir) {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip dist/ directory - it's for npm publishing only
        if (entry.name === 'dist') continue;

        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyHooksRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    copyHooksRecursive(hooksSrc, hooksDest);
    if (verifyInstalled(hooksDest, 'hooks')) {
      console.log(`  ${green}✓${reset} Installed hooks`);
    } else {
      failures.push('hooks');
    }
  }

  // If critical components failed, exit with error
  if (failures.length > 0) {
    console.error(`\n  ${amber}Installation incomplete!${reset} Failed: ${failures.join(', ')}`);
    console.error(`  Try running directly: node ~/.npm/_npx/*/node_modules/@gannonh/kata/bin/install.js --global\n`);
    process.exit(1);
  }

  // Configure hooks in settings.json
  const settingsPath = path.join(claudeDir, 'settings.json');
  const settings = cleanupOrphanedHooks(readSettings(settingsPath));
  const updateCheckCommand = isGlobal
    ? 'node "$HOME/.claude/hooks/kata-check-update.js"'
    : 'node .claude/hooks/kata-check-update.js';

  // Configure SessionStart hook for update checking
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [];
  }

  // Check if Kata update hook already exists
  const hasKataUpdateHook = settings.hooks.SessionStart.some(entry =>
    entry.hooks && entry.hooks.some(h => h.command && h.command.includes('kata-check-update'))
  );

  if (!hasKataUpdateHook) {
    settings.hooks.SessionStart.push({
      hooks: [
        {
          type: 'command',
          command: updateCheckCommand
        }
      ]
    });
    console.log(`  ${green}✓${reset} Configured update check hook`);
  }

  return { settingsPath, settings };
}

/**
 * Write settings and print completion message
 */
function finishInstall(settingsPath, settings) {
  // Write settings (hooks were already configured in install())
  writeSettings(settingsPath, settings);

  console.log(`
  ${green}Done!${reset} Launch Claude Code and run ${amber}/kata:help${reset}.
`);
}

/**
 * Prompt for install location
 */
function promptLocation() {
  // Check if stdin is a TTY - if not, fall back to global install
  // This handles npx execution in environments like WSL2 where stdin may not be properly connected
  if (!process.stdin.isTTY) {
    console.log(`  ${amber}Non-interactive terminal detected, defaulting to global install${reset}\n`);
    const { settingsPath, settings } = install(true);
    finishInstall(settingsPath, settings);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Track whether we've processed the answer to prevent double-execution
  let answered = false;

  // Handle readline close event to detect premature stdin closure
  rl.on('close', () => {
    if (!answered) {
      answered = true;
      console.log(`\n  ${amber}Input stream closed, defaulting to global install${reset}\n`);
      const { settingsPath, settings } = install(true);
      finishInstall(settingsPath, settings);
    }
  });

  const configDir = expandTilde(explicitConfigDir) || expandTilde(process.env.CLAUDE_CONFIG_DIR);
  const globalPath = configDir || path.join(os.homedir(), '.claude');
  const globalLabel = globalPath.replace(os.homedir(), '~');

  console.log(`  ${amber}Where would you like to install?${reset}

  ${amber}1${reset}) Global ${dim}(${globalLabel})${reset} - available in all projects
  ${amber}2${reset}) Local  ${dim}(./.claude)${reset} - this project only
`);

  rl.question(`  Choice ${dim}[1]${reset}: `, (answer) => {
    answered = true;
    rl.close();
    const choice = answer.trim() || '1';
    const isGlobal = choice !== '2';
    const { settingsPath, settings } = install(isGlobal);
    finishInstall(settingsPath, settings);
  });
}

// Main
if (hasGlobal && hasLocal) {
  console.error(`  ${amber}Cannot specify both --global and --local${reset}`);
  process.exit(1);
} else if (explicitConfigDir && hasLocal) {
  console.error(`  ${amber}Cannot use --config-dir with --local${reset}`);
  process.exit(1);
} else if (hasGlobal) {
  const { settingsPath, settings } = install(true);
  finishInstall(settingsPath, settings);
} else if (hasLocal) {
  const { settingsPath, settings } = install(false);
  finishInstall(settingsPath, settings);
} else {
  promptLocation();
}
