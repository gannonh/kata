# Phase 36: Workflow Integration - Research

**Researched:** 2026-02-07
**Domain:** Internal Kata skill modification (SKILL.md editing, context injection patterns)
**Confidence:** HIGH

## Summary

Phase 36 integrates the existing `kata-brainstorm` skill into 5 workflow skills as an optional step, and wires brainstorm SUMMARY.md output into downstream agent context (researcher, planner). All work is internal to the Kata codebase: editing SKILL.md files and agent instruction files. No external libraries, APIs, or new architectural patterns required.

The brainstorm skill (shipped in Phase 35) is invoked via `/kata-brainstorm`, requires Agent Teams, produces output in `.planning/brainstorms/YYYY-MM-DDTHH-MM-brainstorm/`, and writes a `SUMMARY.md` with consolidated proposals. Integration means: (1) offering the user a brainstorm option at the right workflow point via AskUserQuestion, (2) invoking `/kata-brainstorm` if accepted, (3) feeding the resulting SUMMARY.md into downstream agents as context.

**Primary recommendation:** Use a consistent AskUserQuestion pattern across all 5 skills, with `/kata-brainstorm` invoked as a sub-skill when accepted. Wire SUMMARY.md into planner and researcher prompts via an optional `brainstorm_context` injection section.

## Standard Stack

No new libraries. All work uses existing Kata patterns:
- AskUserQuestion for offering optional brainstorm step
- `/kata-brainstorm` skill invocation (already shipped)
- Read tool for loading SUMMARY.md content
- Inline content injection into Task() prompts

## Architecture Patterns

### Pattern 1: Optional Brainstorm Gate

Each integration point follows the same pattern:

```
1. AskUserQuestion offering brainstorm
2. If accepted: display note, invoke /kata-brainstorm
3. After brainstorm completes: continue parent workflow
4. If declined: continue parent workflow unchanged
```

AskUserQuestion structure (consistent across all 5 skills):

```
- header: "Brainstorm"
- question: "[Context-specific question about brainstorming]"
- options:
  - "Brainstorm first" -- Run explorer/challenger brainstorm session
  - "Skip" -- Continue without brainstorming
```

### Pattern 2: Brainstorm SUMMARY.md Context Injection

For CTX-02, downstream agents (researcher, planner) need brainstorm output in their prompts. The pattern:

```bash
# Find most recent brainstorm SUMMARY.md
BRAINSTORM_SUMMARY=""
LATEST_BRAINSTORM=$(ls -dt .planning/brainstorms/*/SUMMARY.md 2>/dev/null | head -1)
if [ -n "$LATEST_BRAINSTORM" ]; then
  BRAINSTORM_SUMMARY=$(cat "$LATEST_BRAINSTORM")
fi
```

Then inject into Task() prompts as an optional section:

```markdown
**Brainstorm context (if exists):**
{brainstorm_summary_content}
```

This follows the existing pattern used for CONTEXT.md and RESEARCH.md: "if exists, inject; if absent, skip silently."

### Pattern 3: Skill-to-Skill Invocation

The brainstorm skill is a full skill with its own process (Steps 0-6). Integration skills should NOT duplicate brainstorm logic. Instead, they should instruct the orchestrator to invoke `/kata-brainstorm` as a sub-workflow. After the brainstorm completes (user sees SUMMARY.md), the parent skill resumes.

Implementation approach: The SKILL.md text says "Run `/kata-brainstorm`" and the orchestrator recognizes this as a skill invocation. After brainstorm completes, the orchestrator returns to the parent skill flow.

## Integration Point Analysis

### WFLOW-01: kata-add-milestone

**Where:** Between Phase 1 (Load Context) and Phase 2 (Gather Milestone Goals).

**Why here:** Brainstorming before gathering goals lets the user explore possibilities before committing to a direction. The brainstorm SUMMARY.md proposals inform what goals to pursue.

**Insertion point:** New "Phase 1.5: Optional Brainstorm" between existing Phase 1 and Phase 2. AskUserQuestion offers brainstorm with context: "Want to brainstorm what to build next before defining milestone goals?"

**Downstream effect:** If brainstorm ran, the SUMMARY.md proposals appear during Phase 2 questioning as reference material.

### WFLOW-02: kata-plan-phase

**Where:** Step 5 (Handle Research), at the research decision gate.

**Why here:** Before committing to research, the user may want to brainstorm implementation approaches. This is the natural decision point where the user decides how to prepare for planning.

**Insertion point:** Add a brainstorm option to the research decision. When no existing research found and no `--skip-research` flag, offer: "Brainstorm first", "Research first", "Skip research". If brainstorm selected, run `/kata-brainstorm`, then proceed to research (or planning if research also skipped).

**Downstream effect:** Brainstorm SUMMARY.md feeds into the researcher and planner prompts (CTX-02).

### WFLOW-03: kata-new-project

**Where:** Between Phase 3 (Deep Questioning) and Phase 4 (Write PROJECT.md).

**Why here:** After the user has described what they want to build (Phase 3), brainstorming can expand their thinking before committing to PROJECT.md. The initial project description provides context for productive brainstorming.

**Insertion point:** New "Phase 3.5: Optional Brainstorm" between Phase 3 and Phase 4. AskUserQuestion: "Want to brainstorm ideas for this project before finalizing?"

**Complication:** Agent Teams prerequisite. If Agent Teams is not enabled, the brainstorm option should not appear (or should be skipped silently). The brainstorm skill handles its own prerequisite check (Step 0), so the parent skill can invoke it and let the brainstorm skill handle the prereq gracefully.

### WFLOW-04: kata-discuss-phase

**Where:** Between step 2 (check existing CONTEXT.md) and step 3 (analyze phase / identify gray areas).

**Why here:** Before presenting gray areas for discussion, the user may want to brainstorm the phase's implementation space. Brainstorm output can inform which gray areas to focus on.

**Insertion point:** New step between existing steps 2 and 3. AskUserQuestion: "Want to brainstorm implementation approaches before discussing gray areas?"

**Downstream effect:** If brainstorm ran, the SUMMARY.md content informs the gray area analysis.

### WFLOW-05: kata-research-phase

**Where:** After Step 5 (Handle Agent Return), when research is complete.

**Why here:** After research reveals the technical landscape, the user may want to brainstorm how to apply those findings. This is a follow-up brainstorm, not a pre-research brainstorm.

**Insertion point:** Add brainstorm option to the post-research offer. Existing options: "Plan phase", "Dig deeper", "Review full", "Done". Add: "Brainstorm approaches". If selected, run `/kata-brainstorm` with research findings as additional context.

**Downstream effect:** Brainstorm SUMMARY.md available for subsequent planning.

## Context Injection Points for CTX-02

Two downstream agents need brainstorm context:

### 1. kata-phase-researcher (phase-researcher-instructions.md)

In the execution flow, Step 1 loads context including CONTEXT.md. Add brainstorm SUMMARY.md loading alongside it:

```bash
# Read brainstorm SUMMARY if exists
BRAINSTORM=$(ls -dt .planning/brainstorms/*/SUMMARY.md 2>/dev/null | head -1)
[ -n "$BRAINSTORM" ] && cat "$BRAINSTORM"
```

The researcher uses this to understand what directions have been explored and what the user is leaning toward.

### 2. kata-planner (planner-instructions.md)

The planner receives context via the orchestrator (kata-plan-phase Step 7/8). The orchestrator already reads CONTEXT.md and RESEARCH.md. Add brainstorm SUMMARY.md to this context assembly:

In kata-plan-phase Step 7 (Read Context Files), add:

```bash
# Read most recent brainstorm SUMMARY.md if exists
BRAINSTORM_CONTEXT=""
LATEST_BRAINSTORM=$(ls -dt .planning/brainstorms/*/SUMMARY.md 2>/dev/null | head -1)
[ -n "$LATEST_BRAINSTORM" ] && BRAINSTORM_CONTEXT=$(cat "$LATEST_BRAINSTORM")
```

Then in Step 8 (Spawn kata-planner), inject into the planning_context block:

```markdown
**Brainstorm (if exists):**
{brainstorm_context}
```

The planner instructions (planner-instructions.md) reference CONTEXT.md and RESEARCH.md in the `gather_phase_context` step. Add a parallel mention of brainstorm SUMMARY.md: "If brainstorm SUMMARY.md exists: Use surviving proposals and cross-cutting themes to inform plan structure."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Brainstorm logic | Custom brainstorm in each skill | `/kata-brainstorm` skill invocation | Brainstorm skill already handles Agent Teams prereq, team lifecycle, explorer/challenger pattern, synthesis |
| Brainstorm discovery | Custom file scanning | `ls -dt .planning/brainstorms/*/SUMMARY.md | head -1` | Consistent, sorted by timestamp, handles missing dir |
| User prompting | Custom prompt patterns | AskUserQuestion with consistent structure | Matches existing Kata UX pattern |

## Common Pitfalls

### Pitfall 1: Blocking parent workflow on Agent Teams prerequisite

**What goes wrong:** If Agent Teams is not enabled, offering brainstorm and then failing at the prereq check wastes user time and confuses the flow.

**How to avoid:** The brainstorm skill handles its own prereq check (Step 0). If the user selects brainstorm and Agent Teams is not enabled, the brainstorm skill will offer to enable it or skip. Either way, control returns to the parent workflow. The parent skill does NOT need to pre-check Agent Teams.

### Pitfall 2: Brainstorm output not found after invocation

**What goes wrong:** After `/kata-brainstorm` completes, the parent workflow needs to find the SUMMARY.md. If the brainstorm directory naming or location changes, the lookup breaks.

**How to avoid:** Use `ls -dt .planning/brainstorms/*/SUMMARY.md | head -1` which finds the most recent brainstorm by directory modification time. This is resilient to naming format changes.

### Pitfall 3: Inflating skill files beyond 500-line limit

**What goes wrong:** Adding brainstorm integration steps to already large SKILL.md files pushes them past the 500-line constraint from CLAUDE.md.

**How to avoid:** Each integration is small (5-15 lines): one AskUserQuestion block plus a conditional invocation. Current file sizes:
- kata-add-milestone: ~1210 lines (already over, but established)
- kata-plan-phase: ~713 lines (already over, but established)
- kata-new-project: ~824 lines (already over, but established)
- kata-discuss-phase: ~87 lines (well under)
- kata-research-phase: ~219 lines (well under)

The additions are minimal and don't meaningfully change the size profile.

### Pitfall 4: Declining brainstorm breaks workflow

**What goes wrong:** If the AskUserQuestion for brainstorm is not properly structured, declining could exit the workflow or skip subsequent steps.

**How to avoid:** The "Skip" option must explicitly continue to the next step in the parent workflow. Each integration point document the exact "If skip, continue to Phase/Step N" behavior.

### Pitfall 5: Stale brainstorm context injected into wrong phase

**What goes wrong:** The "most recent brainstorm" pattern (`ls -dt ... | head -1`) could pick up a brainstorm from a different phase or milestone.

**How to avoid:** This is an acceptable tradeoff. Brainstorm sessions are intentional user actions, and the most recent one is almost always the relevant one. If needed later, brainstorm SUMMARY.md could include a `phase:` or `milestone:` metadata header for filtering. For v1.7.0, the simple "most recent" heuristic is sufficient.

## Code Examples

### AskUserQuestion for brainstorm gate (reusable pattern)

```markdown
Use AskUserQuestion:

- header: "Brainstorm"
- question: "[context-specific prompt]"
- options:
  - "Brainstorm first" -- Run structured explorer/challenger brainstorm
  - "Skip" -- Continue without brainstorming

**If "Brainstorm first":**

Display: "Starting brainstorm session..."

Run `/kata-brainstorm`

After brainstorm completes, continue to [next step].

**If "Skip":** Continue to [next step].
```

### Brainstorm SUMMARY.md discovery

```bash
LATEST_BRAINSTORM=$(ls -dt .planning/brainstorms/*/SUMMARY.md 2>/dev/null | head -1)
if [ -n "$LATEST_BRAINSTORM" ]; then
  BRAINSTORM_CONTEXT=$(cat "$LATEST_BRAINSTORM")
fi
```

### Context injection in Task() prompt

```markdown
**Brainstorm (if exists):**
{brainstorm_context}
```

## Open Questions

1. **Skill-to-skill invocation mechanism**
   - What we know: SKILL.md can reference other skills by name (e.g., "Run `/kata-brainstorm`")
   - What's unclear: Whether the Claude Code orchestrator natively supports one skill invoking another mid-flow, or if this requires the user to manually run the skill
   - Recommendation: Write the instruction as "Run `/kata-brainstorm`" and test whether Claude's orchestrator handles it. If not, the fallback is to instruct the user: "Run `/kata-brainstorm` then return here with `/kata-add-milestone`" (less seamless but functional).

2. **Brainstorm scoping for context injection**
   - What we know: `ls -dt` finds the most recent brainstorm
   - What's unclear: Whether injecting a brainstorm from a different milestone context would confuse downstream agents
   - Recommendation: Accept the "most recent" heuristic for v1.7.0. Add phase/milestone scoping metadata to brainstorm SUMMARY.md in a future milestone if needed.

## Sources

### Primary (HIGH confidence)
- Direct analysis of 5 target SKILL.md files (kata-add-milestone, kata-plan-phase, kata-new-project, kata-discuss-phase, kata-research-phase)
- Direct analysis of kata-brainstorm SKILL.md (shipped in Phase 35)
- Direct analysis of planner-instructions.md and phase-researcher-instructions.md
- REQUIREMENTS.md (WFLOW-01 through WFLOW-05, CTX-02)

### Secondary (MEDIUM confidence)
- Phase 35 SUMMARY files (35-01, 35-02) for brainstorm skill implementation details
- Existing brainstorm output (.planning/brainstorms/2026-02-05T11-18-brainstorm/SUMMARY.md) for output format understanding

## Metadata

**Confidence breakdown:**
- Integration points: HIGH -- direct reading of all source files
- Context injection pattern: HIGH -- follows established CONTEXT.md/RESEARCH.md pattern
- Skill invocation mechanism: MEDIUM -- untested whether skill-to-skill invocation works mid-flow

**Research date:** 2026-02-07
**Valid until:** indefinite (internal codebase, no external dependencies)
