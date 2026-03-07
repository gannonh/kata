#!/bin/bash
# Create a small demo git repo at ~/kata-agents-demo-repo/
# Provides a working directory for the demo workspace.
#
# Usage:
#   bash scripts/create-demo-repo.sh          # Create if missing
#   bash scripts/create-demo-repo.sh --reset  # Wipe and recreate

DEMO_REPO="$HOME/kata-agents-demo-repo"

# Handle --reset
if [ "$1" = "--reset" ] && [ -d "$DEMO_REPO" ]; then
  echo "Resetting demo repo..."
  rm -rf "$DEMO_REPO"
fi

# Skip if exists
if [ -d "$DEMO_REPO" ]; then
  echo "Demo repo already exists at $DEMO_REPO"
  exit 0
fi

echo "Creating demo repo at $DEMO_REPO"
mkdir -p "$DEMO_REPO/src"

# README.md
cat > "$DEMO_REPO/README.md" << 'EOF'
# Demo Project

A sample TypeScript project for testing Kata Agents workflows.

## Getting Started

```bash
bun install
bun run start
```
EOF

# package.json
cat > "$DEMO_REPO/package.json" << 'EOF'
{
  "name": "demo-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {}
}
EOF

# tsconfig.json
cat > "$DEMO_REPO/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
EOF

# src/index.ts
cat > "$DEMO_REPO/src/index.ts" << 'EOF'
import { greet, formatDate } from './utils';

const name = process.argv[2] || 'World';
console.log(greet(name));
console.log(`Current time: ${formatDate(new Date())}`);
EOF

# src/utils.ts
cat > "$DEMO_REPO/src/utils.ts" << 'EOF'
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
EOF

# Initialize git
cd "$DEMO_REPO"
git init -b main
git add -A
git commit -m "Initial commit: demo project setup"

# Second commit (for git diff demo)
cat >> "$DEMO_REPO/src/utils.ts" << 'EOF'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
EOF

git add -A
git commit -m "Add slugify utility function"

echo "Demo repo created at $DEMO_REPO (2 commits on main)"
