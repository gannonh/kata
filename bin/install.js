#!/usr/bin/env node

console.log(`
\x1b[33m╔═══════════════════════════════════════════════════════════╗
║  Kata NPX installation has been deprecated                ║
╚═══════════════════════════════════════════════════════════╝\x1b[0m

Kata is now distributed exclusively as a Claude Code plugin.

\x1b[1mTo install:\x1b[0m
  1. Start Claude Code: \x1b[36mclaude\x1b[0m
  2. Run: \x1b[36m/plugin install kata@gannonh-kata-marketplace\x1b[0m

For more information: https://github.com/gannonh/kata
`);

process.exit(0);
