#!/bin/bash
# Launch Kata Agents demo with a fresh, isolated profile

DEMO_PROFILE="/Users/gannonhall/.kata-agents-demo-fresh"

echo "Launching Kata Agents with fresh profile: $DEMO_PROFILE"

open "/Users/gannonhall/dev/kata/kata-agents/apps/electron/release/extracted-demo/Kata Agents.app" \
  --new \
  --args --user-data-dir="$DEMO_PROFILE"
