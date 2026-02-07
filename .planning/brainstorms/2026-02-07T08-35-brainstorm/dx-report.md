# DX Report: Developer Experience Improvements for v1.8.0

Explorer: explorer-dx
Challenger: challenger-dx (proposals self-critiqued due to timing)
Date: 2026-02-07

---

## Surviving Proposals (Recommended)

### 1. CLAUDE.md Auto-Injection on Project Init

**Verdict:** Ship it. Small scope, high impact, directly addresses an open issue.

**What:** During `/kata-new-project`, automatically append a Kata section to the project's CLAUDE.md. The section tells future Claude sessions that the project uses Kata, where planning files live, and lists primary workflow commands. Use `<!-- kata:start -->` / `<!-- kata:end -->` markers for clean updates.

**Scope:** Small (1 plan). Template creation + append logic in kata-new-project Phase 6.

**Self-critique addressed:**
- Template drift risk is real. Mitigation: keep the CLAUDE.md section generic (point to `/kata-help` for full reference rather than listing all commands).
- Must handle: CLAUDE.md exists with existing content, CLAUDE.md doesn't exist, CLAUDE.md already has a Kata section (update in place).

**Strategic value:** This is the single highest-leverage DX change because it makes Kata self-discovering across sessions. Every new Claude conversation in the project immediately knows Kata exists and how to use it.

---

### 2. Just-in-Time Preferences (Scoped Version)

**Verdict:** Ship a scoped version. Don't refactor all preference reads. Instead, reduce onboarding to essentials and defer 3 specific settings.

**What:** Reduce `/kata-new-project` Phase 5 from 10+ questions to 5 essentials:
- Mode (yolo/interactive)
- Depth (quick/standard/comprehensive)
- Git tracking (yes/no)
- PR workflow (yes/no)
- GitHub integration (yes/no + issue mode)

Defer these 3 to first-encounter:
- Model profile (default balanced, ask on first `/kata-plan-phase`)
- Researcher/verifier/plan-check toggles (default all on, ask on first `/kata-plan-phase` as a single "workflow agents" prompt)
- Statusline (default on, no prompt needed)

**Scope:** Small-medium (1-2 plans). Modify kata-new-project and kata-plan-phase. Add a "check-or-ask" pattern for the 3 deferred settings.

**Self-critique addressed:**
- The original "medium-large" scope estimate was inflated. Scoping to 3 specific settings avoids the full refactoring risk.
- "Interruption during execution" concern is addressed by placing the prompt in the orchestrator (kata-plan-phase) before subagent spawning, not during execution.
- No migration needed: existing configs already have all keys populated.

**Strategic value:** Cuts onboarding time by ~40%. New users reach their first plan faster, which is when Kata's value becomes tangible.

---

### 3. Rich Statusline with Breadcrumb

**Verdict:** Ship it. The infrastructure exists, the parsing patterns are proven, and it addresses a real issue.

**What:** Enhance `kata-statusline.js` to show: `Kata v1.7.0 | Phase 36 | Plan 02/03 | next: execute-phase 36`. Reads STATE.md and ROADMAP.md. Graceful fallback chain: full breadcrumb > version + phase > version only > "Kata" (if no project).

**Scope:** Small (1 plan). Modify existing statusline hook.

**Self-critique addressed:**
- Terminal width: keep total output under 60 chars. Use abbreviations (e.g., "Ph" instead of "Phase") if needed.
- Performance: STATE.md is typically under 5KB. A single `fs.readFileSync` per render is negligible.
- The "suggested next command" component adds the most value but also the most parsing complexity. Consider shipping breadcrumb first, adding command suggestion in a follow-up.

**Strategic value:** Most-viewed Kata UI element. Eliminates the most common reason to run `/kata-track-progress` (just wanting to know where you are).

---

### 4. Workflow Continuity Hints (Standardized Next Up)

**Verdict:** Ship it. High consistency gain across the skill surface.

**What:** Audit all 30 skills. For each that lacks a "Next Up" footer, add one. Use the existing pattern from ui-brand.md. The footer reads current state and suggests 1-2 next skills. Skills that already have routing (kata-execute-phase, kata-track-progress) serve as templates.

**Scope:** Medium (2-3 plans). Audit + updates across many skills, but each individual change is small.

**Self-critique addressed:**
- Not every skill has an obvious "next." For utility skills (kata-help, kata-configure-settings, kata-whats-new), the suggestion can default to `/kata-track-progress` as a universal fallback.
- The concern about feeling prescriptive is mitigated by the fact that Kata's entire value proposition is guided workflow. Users who want full autonomy already know what to do.
- Must avoid circular suggestions (e.g., kata-track-progress suggesting itself).

**Strategic value:** Completes the "continuous momentum" experience. Every skill becomes a link in a chain rather than a dead end.

---

### 5. Error Recovery System (Lightweight Version)

**Verdict:** Ship a lightweight version. Don't audit all 30 skills exhaustively. Instead, fix the top 5 most-common error paths and create the shared pattern for future skills to follow.

**What:** Create a shared reference `kata/references/error-patterns.md` with standard error message format: `[What happened] [Why it matters] [Recovery command]`. Update the 5 most-hit error paths:
1. "Project already initialized" (kata-new-project)
2. "No planning structure found" (kata-track-progress, kata-resume-work)
3. "Phase not found" (kata-execute-phase, kata-plan-phase)
4. "Config missing" (kata-configure-settings)
5. "GitHub CLI not authenticated" (any gh command)

**Scope:** Small (1 plan). Error reference + 5 targeted updates.

**Self-critique addressed:**
- Full audit of 30 skills was scope-inflated. The top 5 errors cover the majority of user encounters.
- The shared reference serves as documentation for skill authors so future skills get error handling right from the start.
- Verbose error messages concern: recovery suggestions are a single line. Total error message stays under 4 lines.

**Strategic value:** Error messages are teaching moments. The first error a new user hits determines whether they persist or abandon the tool.

---

## Deferred Proposals

### 6. First Run Tutorial Mode

**Deferred reason:** High value but high maintenance cost. The sample project must stay compatible with Kata changes. A guided walkthrough script is fragile. Better approach: invest in CLAUDE.md injection (#1) and better onboarding UX (#2) which accomplish 80% of the goal at 20% of the cost. Revisit after v1.8.0 ships and user feedback indicates whether onboarding is still a problem.

**If revisited:** Consider a non-interactive approach: a "quickstart" section in `/kata-help` that shows the exact 4 commands to go from zero to first executed phase, with expected outputs. Documentation rather than a live tutorial.

### 7. Safe Rollback for Plan Execution

**Deferred reason:** Git already provides this. Users working with PR workflow have branches to rollback to. Users on main can use `git log` and `git reset`. A dedicated `kata-rollback` skill adds complexity (especially with PR workflow state management) for a feature that addresses fear rather than actual breakage. The verification and UAT steps already catch problems before they persist. Better approach: add a one-line message at the start of phase execution: "All changes will be on branch {X}. To undo: `git checkout main`."

**If revisited:** Implement only for non-PR-workflow users (those committing to main directly) where rollback is genuinely more complex.

---

## Cross-Cutting Themes

1. **Onboarding is the priority.** Three of five surviving proposals (#1, #2, #5) directly improve the new-user experience. Kata's current user base is growing, and onboarding friction is the primary bottleneck to adoption.

2. **Consistency over novelty.** Standardizing existing patterns (#4 Workflow Continuity, #5 Error Recovery) yields more value than building new features. The infrastructure exists; the gap is coverage.

3. **Progressive disclosure works at every level.** Just-in-time preferences (#2) applies the same progressive disclosure principle that already drives Kata's reference architecture (skills > workflows > templates > references). Asking users to configure what they haven't used is an anti-pattern.

---

## Recommended Sequencing

| Priority | Proposal | Scope | Dependencies |
|----------|----------|-------|-------------|
| 1 | CLAUDE.md Auto-Injection | Small (1 plan) | None |
| 2 | Rich Statusline | Small (1 plan) | None |
| 3 | Just-in-Time Preferences | Small-medium (1-2 plans) | None |
| 4 | Error Recovery System | Small (1 plan) | None |
| 5 | Workflow Continuity Hints | Medium (2-3 plans) | None |

Proposals 1 and 2 can ship in parallel. Proposal 3 can ship independently. Proposals 4 and 5 can be combined into a single "skill polish" phase. Total estimated scope: 6-8 plans across 2-3 phases.
