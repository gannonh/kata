#!/bin/bash
# Launch a demo instance of Kata Agents with a separate workspace for screenshots/videos

# Use a dedicated demo workspace directory
DEMO_WORKSPACE="$HOME/.kata-agents-demo"

# Launch Electron with custom user data directory
/Users/gannonhall/dev/kata/kata-agents/node_modules/.bin/electron \
  /Users/gannonhall/dev/kata/kata-agents/apps/electron \
  --user-data-dir="$DEMO_WORKSPACE" \
  --enable-logging
