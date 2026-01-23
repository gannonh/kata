#!/usr/bin/env node
// Block direct pushes to main branch for this repo

const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));

// Debug: log to file
fs.appendFileSync('/tmp/hook-debug.log', JSON.stringify(input, null, 2) + '\n---\n');

const command = input.tool_input?.command || '';

// Patterns that indicate pushing to main
const mainPushPattern = /git\s+push\s+(?:--[a-z-]+\s+)*(?:-[a-z]+\s+)*(?:origin\s+)?main\b/i;

if (mainPushPattern.test(command)) {
  console.log(JSON.stringify({
    decision: "block",
    reason: "Direct push to main blocked. Create a branch and open a PR instead.\n\nIf this is a hotfix, ask the user to push manually."
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "allow" }));
