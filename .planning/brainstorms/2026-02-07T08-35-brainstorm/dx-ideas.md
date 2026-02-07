# DX Ideas: Developer Experience Improvements for v1.8.0

Explorer: explorer-dx
Remit: Onboarding, day-to-day workflow friction, error messages, discoverability, quality-of-life

---

## Idea 1: Guided First Run Experience

**Name:** First Run Tutorial Mode

**What:** When a user installs Kata and runs `/kata-help` or `/kata-new-project` for the first time, detect that no `.planning/` directory exists anywhere in the user's recent project history and offer an interactive walkthrough. The walkthrough uses a sample micro-project (a "kata" in the martial arts sense: a small, repeatable exercise) to demonstrate the full cycle: project init, milestone, plan, execute, verify. The user builds something real but tiny (e.g., a CLI hello-world with tests) so they experience every workflow step in under 10 minutes.

**Why:** Kata has 30 skills. New users face a blank prompt and a help page listing commands. The open issues (#new-user-ux-expectations, #claudemd-kata-onboarding) both point at this gap. A guided first run converts "what do I do?" into "I know how this works." The questioning flow during `/kata-new-project` is sophisticated but presumes the user understands the project-milestone-phase-plan hierarchy. Without that mental model, the deep questioning feels disorienting rather than helpful.

**Scope:** Medium. Requires a new skill (`kata-first-run` or similar), a sample project template, and detection logic. The sample project itself is small. The main work is authoring the walkthrough narrative that stays brief while covering the key concepts.

**Risks:**
- Walkthrough could feel patronizing to experienced users. Mitigation: detection-based (only triggers on first use) with explicit skip option.
- Sample project could become stale or break with future Kata changes. Mitigation: keep the sample extremely minimal.
- Adds maintenance surface for a feature that each user sees once.

---

## Idea 2: CLAUDE.md Auto-Injection on Project Init

**Name:** CLAUDE.md Kata Section

**What:** During `/kata-new-project`, automatically add a Kata section to the project's CLAUDE.md (creating it if it doesn't exist). This section tells future Claude sessions that the project uses Kata, where planning files live, what the hierarchy is (project > milestone > phase > plan), and lists the primary workflow commands. The section is templated and concise (under 30 lines).

**Why:** Directly addresses open issue #claudemd-kata-onboarding. Without this, every new Claude session in a Kata project starts cold. Claude may attempt ad-hoc approaches instead of using Kata workflows. The CLAUDE.md section acts as persistent session-level context that survives `/clear` and new conversations. This is zero-friction: it happens automatically during init, and the user doesn't need to do anything.

**Scope:** Small. A template in `kata/templates/claudemd-section.md`, a Write call during Phase 6 of `kata-new-project`, and merge logic to append to existing CLAUDE.md without clobbering user content.

**Risks:**
- Could conflict with user's existing CLAUDE.md structure. Mitigation: append to end with clear section markers (e.g., `<!-- kata:start -->` / `<!-- kata:end -->`) so it's easy to find and update.
- Template could drift from actual skill names/commands. Mitigation: generate from skill metadata at build time.

---

## Idea 3: Progressive Preference Discovery

**Name:** Just-in-Time Preferences

**What:** Replace the current "10+ questions during onboarding" pattern with progressive preference capture. `/kata-new-project` asks only 3 essentials: mode (yolo/interactive), depth, and whether to use git tracking. All other preferences (PR workflow, GitHub integration, researcher agent, verifier agent, model profile, statusline) get asked the first time a workflow encounters them. For example, the first time `kata-execute-phase` runs and would spawn a verifier, it checks config.json for the `workflow.verifier` key. If missing, it asks once, persists the answer, and never asks again.

**Why:** Addresses open issue #user-workflow-preferences-override-mechanism. The current onboarding asks users to make decisions about features they haven't experienced yet. "Spawn Plan Researcher?" is meaningless to a new user. Progressive discovery means users answer questions when they have context to make informed choices. This also shortens the time-to-first-plan, which is the moment users first see Kata's value.

**Scope:** Medium-large. Requires refactoring preference reads across multiple skills to use a "check-or-ask" pattern. Needs a shared utility or reference document that all skills can use. The config.json schema stays the same; only the timing of population changes.

**Risks:**
- Users may feel interrupted during execution if a preference prompt appears mid-flow. Mitigation: limit just-in-time prompts to orchestrator-level decisions, never inside subagent execution.
- Migration for existing projects: config.json already has all keys set. No impact on existing users, only new ones.
- Harder to test: preferences emerge at different times depending on which skills get used.

---

## Idea 4: Contextual Error Messages with Recovery Paths

**Name:** Error Recovery System

**What:** Audit every error path across all 30 skills and replace generic error messages with contextual ones that include: (1) what went wrong, (2) why it matters, (3) a specific recovery command. For example, instead of "Error: Project already initialized", show "Project already initialized at .planning/PROJECT.md. To check current status: `/kata-track-progress`. To reconfigure settings: `/kata-configure-settings`." Create a shared error reference that skills can import for consistent error formatting.

**Why:** Error messages are the primary teaching surface for a tool. When something goes wrong, the error message is the only thing the user reads. Current error handling is inconsistent: some skills exit with helpful messages, others return bare errors. A user who hits an error and doesn't know how to recover may abandon the tool. Recovery-oriented errors convert friction into learning moments.

**Scope:** Medium. Audit of all skills for error paths (systematic but not complex). A shared error reference template. Updates to each skill's error handling sections.

**Risks:**
- Verbose error messages could clutter the terminal for experienced users. Mitigation: keep recovery suggestions to one line each.
- Error paths are hard to test exhaustively. Some errors may be rare enough that the improvement is low-value.
- Maintenance burden: recovery commands must stay accurate as skills evolve.

---

## Idea 5: Statusline with Workflow Breadcrumb

**Name:** Rich Statusline

**What:** Enhance the existing statusline (already in config.json as `display.statusline`) to show a workflow breadcrumb: `v1.7.0 | Phase 36/36 | Plan 02/03 | /kata-execute-phase 36`. The breadcrumb shows version, current position in the milestone, current plan position in the phase, and the suggested next command. Reads from STATE.md and ROADMAP.md to compute position. Falls back gracefully when data is missing (e.g., just shows version if no milestone is active).

**Why:** Directly addresses open issue #statusline-kata-project-info. The statusline is the most-seen piece of Kata UI because it's always visible. A breadcrumb eliminates the need to run `/kata-track-progress` just to remember where you are. The suggested next command reduces the "what do I do next?" problem to zero. This is especially valuable after `/clear` when all conversation context is gone but the statusline persists.

**Scope:** Small-medium. The statusline hook (`kata-statusline.js`) already exists. The main work is reading STATE.md and ROADMAP.md, computing the breadcrumb, and handling edge cases (no project, between milestones, project init in progress).

**Risks:**
- STATE.md parsing could be fragile if the format changes. Mitigation: use the same parsing patterns already in `kata-track-progress`.
- Statusline width is limited. The breadcrumb must be concise. Tested against various terminal widths.
- Performance: reading files on every statusline render. Mitigation: STATE.md is small; this is a single file read.

---

## Idea 6: Skill Chaining Suggestions

**Name:** Workflow Continuity Hints

**What:** After every skill completes, append a "What's next?" footer that suggests 1-2 logical next skills based on current project state. These already exist in some skills (e.g., `/kata-execute-phase` has "Route A/B/C/D" logic) but are inconsistent. Standardize the pattern: every skill reads STATE.md at completion and outputs a contextual suggestion. Include the command to copy-paste, plus a reminder about `/clear` for fresh context.

**Why:** The "Next Up" pattern in existing skills is one of Kata's strongest UX elements. It creates a feeling of continuous momentum. But coverage is incomplete: `kata-add-issue`, `kata-debug`, `kata-discuss-phase`, `kata-configure-settings`, and others end without routing to the next action. Extending this pattern to all 30 skills creates a fully guided workflow where the user never has to think about what comes next.

**Scope:** Medium. Each skill needs a completion step that reads state and outputs routing. A shared reference for the "Next Up" rendering format already exists (ui-brand.md). The main work is auditing each skill and adding the completion logic.

**Risks:**
- Could feel prescriptive for advanced users who know what they want to do. Mitigation: suggestions are informational, not blocking.
- Some skills don't have clear "next" actions (e.g., `kata-debug` may lead anywhere). Mitigation: fall back to `/kata-track-progress` as the universal suggestion.

---

## Idea 7: Undo / Rollback Safety Net

**Name:** Safe Rollback for Plan Execution

**What:** Before `kata-execute-phase` begins execution, record a git checkpoint (a lightweight tag like `kata-pre-phase-36`). After execution, if the user is unhappy with results, offer a `kata-rollback` command that resets to the checkpoint. This is especially valuable for YOLO mode where plans execute without confirmation gates.

**Why:** The biggest fear with autonomous AI execution is "what if it breaks everything?" Even with verification and UAT, some users want the ability to undo a full phase of work. Git already provides this capability, but users may not know how to use `git reset` safely. A dedicated rollback command abstracts the complexity and makes autonomous execution feel safer, which encourages adoption of YOLO mode (the faster, more productive mode).

**Scope:** Medium. Pre-execution tag creation is trivial. The rollback skill needs to handle: reset to tag, clean up SUMMARY.md files, update STATE.md, and handle the case where the user has made manual changes after execution. The PR workflow case is more complex (need to close the draft PR, delete the branch).

**Risks:**
- Users could lose intentional post-execution changes if they rollback carelessly. Mitigation: always show a diff summary before confirming rollback.
- Rollback with PR workflow: need to handle GitHub state (draft PRs, issues). Adds significant complexity.
- False sense of safety: rollback doesn't undo external side effects (deployed code, sent notifications). Make limitations clear.
