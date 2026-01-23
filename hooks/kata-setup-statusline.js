#!/usr/bin/env node
// Kata Statusline Setup Hook
// Runs on SessionStart to set up the statusline if configured

import fs from 'fs';
import path from 'path';

// Read JSON from stdin (SessionStart hook input)
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

    // Check if statusline is enabled in config
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (!fs.existsSync(configPath)) {
      process.exit(0); // No config, nothing to do
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.display?.statusline) {
      process.exit(0); // Statusline not enabled
    }

    // Check if statusline hook already exists
    const projectHookPath = path.join(cwd, '.claude', 'hooks', 'kata-statusline.js');
    if (fs.existsSync(projectHookPath)) {
      process.exit(0); // Already set up
    }

    // Find the source statusline hook
    let sourceHook = null;

    // Try plugin root first
    if (pluginRoot) {
      const pluginHook = path.join(pluginRoot, 'hooks', 'kata-plugin-statusline.js');
      if (fs.existsSync(pluginHook)) {
        sourceHook = pluginHook;
      }
    }

    // Try NPM locations
    if (!sourceHook) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const npmGlobal = path.join(homeDir, '.claude', 'kata', 'hooks', 'kata-npm-statusline.js');
      if (fs.existsSync(npmGlobal)) {
        sourceHook = npmGlobal;
      }
    }

    if (!sourceHook) {
      process.exit(0); // No source hook found
    }

    // Create .claude/hooks directory
    const hooksDir = path.join(cwd, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    // Copy the hook
    fs.copyFileSync(sourceHook, projectHookPath);

    // Set up settings.json if needed
    const settingsPath = path.join(cwd, '.claude', 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }

    if (!settings.statusLine) {
      settings.statusLine = {
        type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/kata-statusline.js"'
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }

    console.log('✓ Kata statusline configured');
  } catch (e) {
    // Silent fail - don't break session start
  }
});
