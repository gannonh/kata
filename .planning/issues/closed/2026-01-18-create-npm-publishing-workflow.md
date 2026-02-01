---
created: 2026-01-18T06:54
title: Create npm publishing GitHub Action
area: tooling
files:
  - .github/workflows/publish.yml
  - package.json
---

## Problem

Currently there's no automated publishing workflow. When changes are merged to main, the npm package needs to be published manually.

Need a GitHub Actions workflow that automatically publishes to npm when:
- Code is merged to main branch
- Version in package.json has changed

This ensures the published package stays in sync with the main branch and users can get updates via `/kata:update`.

## Solution

Create `.github/workflows/publish.yml` that:
1. Triggers on push to main
2. Checks if package.json version changed
3. Runs tests (if they exist)
4. Publishes to npm using NPM_TOKEN secret
5. Creates a GitHub release with changelog

Prerequisites:
- Need to set up NPM_TOKEN in GitHub repository secrets
- Package must be renamed first (see todo: rename-cli-package)
