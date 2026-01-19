---
status: testing
phase: 00-convert-commands-to-skills
source: 00-01-SUMMARY.md, 00-02-SUMMARY.md, 00-03-SUMMARY.md, 00-04-SUMMARY.md, 00-05-SUMMARY.md, 00-06-SUMMARY.md, 00-07-SUMMARY.md, 00-08-SUMMARY.md, 00-09-SUMMARY.md
started: 2026-01-19T21:15:00Z
updated: 2026-01-19T21:16:00Z
---

## Current Test

number: 2
name: kata-planning Skill Invocation
expected: |
  Saying "help me plan phase 1" or similar triggers kata-planning skill,
  which appears in Claude's response as skill invocation
awaiting: user response

## Tests

### 1. Skills Installation
expected: Running `node bin/install.js --local` copies all 8 skills. After installation, `ls .claude/skills/kata-*` shows 8 directories: kata-planning, kata-execution, kata-verification, kata-project-initialization, kata-milestone-management, kata-roadmap-management, kata-research, kata-utility
result: pass

### 2. kata-planning Skill Invocation
expected: Saying "help me plan phase 1" or similar triggers kata-planning skill, which appears in Claude's response as skill invocation
result: [pending]

### 3. kata-execution Skill Invocation
expected: Saying "execute the current phase" or similar triggers kata-execution skill invocation
result: [pending]

### 4. kata-verification Skill Invocation
expected: Saying "verify the work on phase 0" or similar triggers kata-verification skill invocation
result: [pending]

### 5. kata-project-initialization Skill Invocation
expected: Saying "start a new project" or similar triggers kata-project-initialization skill invocation
result: [pending]

### 6. kata-milestone-management Skill Invocation
expected: Saying "create a new milestone" or "audit the milestone" triggers kata-milestone-management skill invocation
result: [pending]

### 7. kata-roadmap-management Skill Invocation
expected: Saying "add a phase to the roadmap" or "insert an urgent phase" triggers kata-roadmap-management skill invocation
result: [pending]

### 8. kata-research Skill Invocation
expected: Saying "research how to implement phase 2" or "discuss the phase approach" triggers kata-research skill invocation
result: [pending]

### 9. kata-utility Skill Invocation
expected: Saying "check progress" or "debug this issue" triggers kata-utility skill invocation
result: [pending]

### 10. CLAUDE.md Skills Documentation
expected: Opening CLAUDE.md shows a "Skills Architecture" section documenting all 8 skills with their purpose and sub-agents table
result: [pending]

## Summary

total: 10
passed: 1
issues: 0
pending: 9
skipped: 0

## Gaps

[none yet]
