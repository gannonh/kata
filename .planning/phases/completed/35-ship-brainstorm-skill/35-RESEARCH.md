# Phase 35 Research: Ship Brainstorm Skill

## Standard Stack

No new dependencies. This phase modifies existing SKILL.md and uses standard Kata patterns:

- **Agent Teams API:** TeamCreate, TeamDelete, SendMessage, TaskCreate, TaskUpdate, TaskList (already available in Claude Code with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
- **Settings manipulation:** Node.js `fs` + `JSON.parse/stringify` for `~/.claude/settings.json` (established pattern in kata-configure-settings, kata-new-project)
- **Build system:** `scripts/build.js` copies all `skills/kata-*` directories automatically. No build changes needed.

## Architecture Patterns

### 1. Prerequisite Check Pattern (PREREQ-01, PREREQ-02, PREREQ-03)

Insert a new Step 0 before the existing Step 1 (Gather Context). The check reads `~/.claude/settings.json` and inspects the `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` key.

**Runtime detection method (HIGH confidence):**

```bash
echo "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"
```

When set in `~/.claude/settings.json` under `env`, Claude Code injects the value into the process environment. Confirmed: the env var IS available to bash commands at runtime. If the var is unset or not `"1"`, Agent Teams are not enabled.

**Detection flow:**

```
Step 0: Check Agent Teams Prerequisite
  1. Check env var: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  2. If "1" → continue to Step 1
  3. If not "1" → AskUserQuestion:
     - "Enable Agent Teams?"
     - Option A: "Yes, enable" → merge into ~/.claude/settings.json → inform user restart needed
     - Option B: "Skip brainstorm" → display explanation, exit gracefully
```

**Why env var check over settings.json read:** The env var is the definitive runtime signal. A user could set the env var through other means (shell profile, project settings). Reading settings.json only tells you what the file says, not whether the feature is active.

**Fallback:** Also check settings.json as a secondary signal in case the env var was set but not yet active (requires session restart). This handles the "just enabled but didn't restart" case.

### 2. Settings.json Merge Pattern (PREREQ-02)

The established pattern from kata-configure-settings and kata-new-project uses Node.js for JSON manipulation:

```bash
node -e "
  const fs = require('fs');
  const path = require('path');
  const settingsPath = path.join(process.env.HOME, '.claude', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    // File doesn't exist or is invalid
  }
  if (!settings.env) settings.env = {};
  settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
"
```

**Key behaviors:**
- Read existing file, parse, merge, write back (preserves all other settings)
- Handle missing file (create with just the env key)
- Handle missing `env` key (create it)
- Use `$HOME` for path resolution (cross-platform)
- After writing, inform user: "Settings updated. Restart Claude Code for Agent Teams to take effect."

**Caution:** The requirement says `~/.claude/settings.json`, which is the **global** user settings. This is correct because Agent Teams is a user-level feature, not a project-level one. The project-level settings at `.claude/settings.json` has a different schema and purpose.

### 3. Context Injection Pattern (CTX-01)

The current skill says "Read README or equivalent project overview" generically. For Kata integration, replace with specific Kata artifact assembly.

**Context assembly approach:** The orchestrator (SKILL.md Step 1) reads and condenses project context before spawning agents. This follows the established pattern in kata-add-milestone (Phase 7) and kata-plan-phase (Step 7), where the orchestrator reads files and inlines content into Task prompts.

**Files to read and condense:**

| Source | What to extract | Max size |
|--------|----------------|----------|
| `.planning/PROJECT.md` | Core value, current milestone goals, validated requirements, constraints | ~500 words |
| `.planning/ROADMAP.md` | Current milestone phases, progress summary table | ~300 words |
| `.planning/issues/open/*.md` | Issue titles and areas (summary list) | ~200 words |
| `.planning/MILESTONES.md` | Recent milestone names and dates | ~100 words |
| `.planning/STATE.md` | Current position, accumulated decisions | ~200 words |

**Condensation strategy:** Build a `PROJECT_BRIEF` string that gets injected into both explorer and challenger prompt templates at the `[CONDENSED PROJECT BRIEF]` placeholder. Total target: ~1300 words (well under context limits for subagents).

**Conditional assembly:** If `.planning/` directory does not exist (non-Kata project), fall back to the generic behavior (read README, etc.). This keeps the skill useful outside Kata projects.

```
if [ -d ".planning" ]; then
  # Kata project: assemble from planning artifacts
else
  # Generic: read README, package.json description, etc.
fi
```

### 4. Build System Integration (SKILL-01)

**Finding (HIGH confidence):** The build system at `scripts/build.js` automatically includes all `skills/kata-*` directories. The `copySkillsForPlugin` function iterates over all directories in `skills/` that aren't excluded. Since `skills/kata-brainstorm/` already exists and starts with `kata-`, it is already included in the build output.

**Verified:** The current `dist/plugin/skills/kata-brainstorm/` directory already exists after `npm run build:plugin`. No build changes required.

### 5. Skill Invocation (SKILL-02)

**Finding (HIGH confidence):** The SKILL.md already has correct YAML frontmatter:

```yaml
---
name: kata-brainstorm
description: Run structured brainstorming sessions using paired explorer/challenger agent teams...
metadata:
  version: "0.1.0"
---
```

Claude Code loads skills from `skills/*/SKILL.md` and matches by name and description triggers. The frontmatter is correct and will enable `/kata-brainstorm` invocation. The description includes trigger phrases: "brainstorm", "explore ideas", "what should we build next", "generate options", "run an ideation session".

### 6. Team API Naming (Skill Update Needed)

**Finding (MEDIUM confidence):** The current SKILL.md references `Teammate` tool with `spawnTeam` and `cleanup` actions (lines 50, 129). The actual Claude Code Agent Teams API uses:

- `TeamCreate` (not `Teammate(spawnTeam)`)
- `TeamDelete` (not `Teammate(cleanup)`)
- `SendMessage` for inter-agent communication
- `TaskCreate`, `TaskUpdate`, `TaskList` for task coordination

The personal skill was written before the API stabilized. The SKILL.md references need updating to match the current tool names. The explorer/challenger prompt templates correctly reference TaskUpdate and TaskList.

## Don't Hand-Roll

- **JSON merge logic** — Use Node.js `JSON.parse`/`JSON.stringify` as established in kata-configure-settings. Do not use sed/awk/jq for settings.json manipulation.
- **File existence checks** — Use bash `[ -f ]` and `[ -d ]` as established across all Kata skills.
- **Agent Teams feature detection** — Use the env var. Do not attempt to detect Agent Teams by probing for tool availability or catching errors from TeamCreate.
- **Context condensation** — Read files with the Read tool in the orchestrator and inline into prompts. Do not have subagents read planning files (they may not have access or context).

## Common Pitfalls

### 1. Settings.json Overwrite (CRITICAL)

**Risk:** Writing `{"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}}` to `~/.claude/settings.json` would destroy all other settings (permissions, hooks, plugins, model preferences).

**Prevention:** Always read-merge-write. The node.js pattern above handles this correctly. The planner must specify merge behavior explicitly in the task action.

### 2. Session Restart Requirement

**Risk:** After writing `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to settings.json, the env var is not available until Claude Code restarts. If the skill immediately tries to use Agent Teams, it will fail.

**Prevention:** After enabling, display a clear message: "Agent Teams enabled. Please restart Claude Code (`/exit` then relaunch) and run `/kata-brainstorm` again." Do NOT attempt to proceed with the brainstorm after just-enabling.

### 3. Global vs Project Settings Confusion

**Risk:** `~/.claude/settings.json` (global) vs `.claude/settings.json` (project-level). The env var for Agent Teams belongs in the global file since it's a user-level feature flag.

**Prevention:** Use `$HOME/.claude/settings.json` (with path.join) for the prerequisite check/write. The project-level `.claude/settings.json` has a different schema and should not be modified for this purpose.

### 4. Non-Kata Project Fallback

**Risk:** The context injection step assumes `.planning/` exists. If someone runs `/kata-brainstorm` in a project without Kata planning artifacts, the context step would fail.

**Prevention:** Check for `.planning/` existence. If absent, use generic context gathering (README, package.json, etc.) as the personal skill does. This keeps the skill useful outside Kata.

### 5. Agent Teams Tool Name Mismatch

**Risk:** The current SKILL.md uses `Teammate` tool references from an older API version. If not updated, Claude will attempt to use a nonexistent tool.

**Prevention:** Update Step 3 and Step 6 references from `Teammate(spawnTeam)` to `TeamCreate` and from `Teammate(cleanup)` to `TeamDelete`.

## Code Examples

### Prerequisite Check (Step 0)

```bash
# Check if Agent Teams are enabled
AGENT_TEAMS_ENABLED="$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"

if [ "$AGENT_TEAMS_ENABLED" != "1" ]; then
  # Secondary check: inspect settings.json
  SETTINGS_VAL=$(node -e "
    try {
      const fs = require('fs');
      const path = require('path');
      const s = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.claude', 'settings.json'), 'utf8'));
      console.log((s.env && s.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) || '');
    } catch(e) { console.log(''); }
  " 2>/dev/null)

  if [ "$SETTINGS_VAL" = "1" ]; then
    echo "ENABLED_BUT_NEEDS_RESTART"
  else
    echo "NOT_ENABLED"
  fi
else
  echo "ENABLED"
fi
```

### Settings.json Merge (Enable Agent Teams)

```bash
node -e "
  const fs = require('fs');
  const path = require('path');
  const settingsPath = path.join(process.env.HOME, '.claude', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {}
  if (!settings.env) settings.env = {};
  settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log('Agent Teams enabled in ~/.claude/settings.json');
"
```

### Kata Context Assembly

```bash
# Assemble project brief from Kata planning artifacts
PROJECT_BRIEF=""

if [ -d ".planning" ]; then
  # Read core files (orchestrator uses Read tool, not bash)
  # This is pseudocode showing what to assemble:
  # 1. PROJECT.md: core value + current milestone goals + constraints
  # 2. ROADMAP.md: current milestone phases with goals
  # 3. Open issues: title + area list
  # 4. STATE.md: current position

  ISSUE_COUNT=$(find .planning/issues/open -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  echo "Kata project detected. ${ISSUE_COUNT} open issues."
fi
```

### AskUserQuestion Pattern for Prerequisite

```
AskUserQuestion:
  header: "Agent Teams Required"
  question: "Brainstorming requires Claude Code Agent Teams (experimental). Enable it?"
  options:
    - "Enable Agent Teams" — Writes setting and requires restart
    - "Skip brainstorm" — Exit without brainstorming
```

## Confidence Levels

| Finding | Confidence | Evidence |
|---------|-----------|----------|
| Build system auto-includes kata-brainstorm | HIGH | Verified in build.js: copies all skills/kata-* dirs |
| Env var available at runtime from settings.json | HIGH | Confirmed: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` returns "1" |
| Node.js merge pattern for settings.json | HIGH | Established in kata-configure-settings, kata-new-project |
| Settings.json is global (~/.claude/) for Agent Teams | HIGH | Verified: env vars are in global settings, not project settings |
| Teammate tool name outdated in current skill | MEDIUM | Current skill uses Teammate(spawnTeam), API uses TeamCreate |
| Session restart required after enabling env var | HIGH | Env vars from settings.json inject at Claude Code startup |
| Non-Kata fallback needed for context step | HIGH | Skill should work outside Kata projects |

## Summary

Phase 35 is straightforward. The skill exists and works. Three changes needed:

1. **Add prerequisite check** (new Step 0): Check env var, offer to enable, handle restart-needed and decline paths.
2. **Replace context gathering** (modify Step 1): Kata-specific artifact assembly when `.planning/` exists, generic fallback otherwise.
3. **Update Agent Teams API references** (modify Steps 3, 6): Replace `Teammate(spawnTeam)` with `TeamCreate`, `Teammate(cleanup)` with `TeamDelete`.

All patterns are established in the codebase. No new libraries, no new architecture. Low risk.
