---
created: 2026-01-18T16:46
title: Add optional npm release workflow to Kata
area: tooling
files:
  - /Users/gannonhall/.claude/commands/npm-release.md
  - commands/kata/
---

## Problem

Kata projects that publish to npm need a release workflow. There's an existing `/npm-release` command that handles:
- Commit analysis since last release
- CHANGELOG.md generation (Keep a Changelog format)
- Semantic version bumping
- Release commit with marker ("NPM VERSION BUMP: X.X.X")
- PR creation for CI-triggered publish

This should be available as an optional Kata workflow, coordinated with `/kata:complete-milestone` (which owns git tags).

## Solution

Port `/Users/gannonhall/.claude/commands/npm-release.md` to Kata system:
- Add as `/kata:npm-release` command
- Integrate with milestone completion (tags first, then publish)
- Make optional (not all Kata projects are npm packages)
- Follow Kata style conventions (XML structure, imperative voice)
