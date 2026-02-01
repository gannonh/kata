---
created: 2026-01-18T06:52
title: Rename CLI package from kata-cli
area: tooling
files:
  - package.json
  - install.js
---

## Problem

The npm package name `kata-cli` is already taken by another project (version 2.7.2 exists on npm). When users try to update Kata using `/kata:update`, it attempts to install the wrong package.

This was discovered when running `/kata:update` - the installed version shows 0.1.0 (our fork) but npm reports 2.7.2 as the latest version (unrelated package).

## Solution

Need to:
1. Choose a new unique npm package name (suggestions: `@gannonh/kata`, `kata-pm`, `kata-dev`, etc.)
2. Update package.json with new name
3. Update install.js references
4. Update all documentation referencing `kata-cli`
5. Publish initial version to npm under new name
6. Update `/kata:update` and `/kata:whats-new` commands to use new package name
