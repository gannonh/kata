---
created: 2026-01-18T17:29
title: Add new user UX expectations to onboarding
area: planning
files:
  - commands/kata/new-project.md
  - kata/workflows/new-project.md
---

## Problem

New Kata users don't know what to expect from the system. While Kata largely runs itself, users benefit from understanding:
- The conversational interface ("let's plan phase 1" works)
- Each action ends with clear next steps
- The system guides you through the workflow
- No need to memorize commands

Without this context, users may feel uncertain about how to interact.

## Solution

During `/kata:new-project` onboarding, include a brief "How Kata Works" section:

```
## How to Use Kata

Kata is conversational - just describe what you want:
- "let's plan phase 1"
- "execute the next plan"
- "what's my progress?"

Each action ends with suggested next steps. The system guides you through:
project → milestone → phases → plans → execution → verification

You don't need to memorize commands - Kata will suggest what's next.
```

Keep it simple - the system really does run itself.
