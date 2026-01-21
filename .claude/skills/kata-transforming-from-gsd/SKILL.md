---
name: kata-transforming-from-gsd
description: Use this skill when transforming get-shit-done repository files to kata format. Handles copying, renaming, text replacement, skill conversion, command generation, validation, and deployment. Triggers include "transform from gsd", "gsd to kata", "update from gsd", "sync from gsd".
version: 0.1.0
user-invocable: false
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
---

# Transforming GSD to Kata

Orchestrate complete transformation of get-shit-done (GSD) repository files into Kata format.

## Workflow

1. Pull latest GSD from GitHub
2. Copy to `gsd-source/` (reference) and transform to `kata-staging/`
3. Run text replacements on kata-staging/
4. Convert GSD commands to Kata skills (inline)
5. Post-process skill frontmatter
6. Generate Kata commands (inline)
7. Validate transformation
8. Request user approval
9. Deploy to final destinations if approved

## Paths

**Source:** `/Users/gannonhall/dev/oss/get-shit-done`

**Staging:** `/Users/gannonhall/dev/oss/kata/dev/transform/`
- `gsd-source/` - Pristine copy of GSD repo
- `kata-staging/` - Transformed files ready for deployment

**Scripts:**
- `dev/transform-gsd-to-kata.py` — Copy and transform
- `dev/replace-gsd-with-kata.py` — Text replacement
- `dev/post-process-skill-frontmatter.py` — Add skill frontmatter

## Process

### Step 1: Pull Latest GSD

```bash
cd /Users/gannonhall/dev/oss/get-shit-done
git pull origin main
```

Display git pull output. If pull fails, display error and STOP.

### Step 2: Copy and Transform

```bash
cd /Users/gannonhall/dev/oss/kata
python3 dev/transform-gsd-to-kata.py
```

Creates:
- `dev/transform/gsd-source/` - Full copy of GSD repo
- `dev/transform/kata-staging/` - Transformed files (agents renamed, etc.)

Display: "✓ Step 1: Files copied and transformed"

### Step 3: Text Replacement

```bash
cd /Users/gannonhall/dev/oss/kata/dev/transform/kata-staging
python3 ../../../dev/replace-gsd-with-kata.py
cd ../../..
```

Display: "✓ Step 2: Text replaced (gsd → kata)"

### Step 4: Convert GSD Commands to Kata Skills (Inline)

Copy GSD commands to kata-staging for conversion:

```bash
cp -r dev/transform/gsd-source/commands/gsd dev/transform/kata-staging/commands/
```

**For each GSD command in `dev/transform/gsd-source/commands/gsd/`:**

1. **Determine skill name:**
   - `add-phase.md` → `kata-adding-phases`
   - Pattern: Remove gsd namespace, add kata- prefix, convert verb to gerund form
   - `add-phase` → `adding-phases`
   - `plan-phase` → `planning-phases`
   - `execute-plan` → `executing-plans`
   - `verify-work` → `verifying-work`

2. **Check if skill exists in `dev/transform/kata-staging/skills/kata-{skill-name}/SKILL.md`**

3. **If skill EXISTS:**
   - Read existing skill
   - Parse and preserve existing YAML frontmatter
   - Read GSD command content (everything below frontmatter)
   - Replace skill content (below frontmatter) with GSD command content
   - Write updated skill

4. **If skill does NOT exist:**
   - Create new frontmatter:
     ```yaml
     ---
     name: kata-{skill-name}
     description: {enhanced description with triggers}
     ---
     ```
   - Copy GSD command content (below frontmatter)
   - Write new skill to `dev/transform/kata-staging/skills/kata-{skill-name}/SKILL.md`

**Name transformation algorithm:**

```
command_name → skill_name:
  add-phase → adding-phases
  plan-phase → planning-phases
  execute-plan → executing-plans
  verify-work → verifying-work
  new-project → starting-new-projects
  debug → debugging
  quick → quick-tasks

Gerund rules:
  - add → adding
  - plan → planning
  - execute → executing
  - verify → verifying
  - start/new → starting
  - debug → debugging

Pluralization:
  - phase → phases
  - plan → plans (except in "planning")
  - project → projects
  - work → work (no change)
```

**Description enhancement:**
- Original: "Add a new phase to the roadmap"
- Enhanced: "Use this skill when adding planned phases to the roadmap, appending sequential work to milestones, or creating new phase entries. Triggers include 'add phase', 'append phase', 'new phase', and 'create phase'."

Display: "✓ Step 3: Commands converted to skills"

### Step 5: Post-Process Skill Frontmatter

```bash
python3 dev/post-process-skill-frontmatter.py
```

Adds to each skill:
- version: 0.1.0
- user-invocable: false
- disable-model-invocation: false
- allowed-tools: [Read, Write, Bash]

Display: "✓ Step 4: Skill frontmatter completed"

### Step 6: Generate Kata Commands (Inline)

**For each skill in `dev/transform/kata-staging/skills/kata-*/SKILL.md`:**

1. **Determine command name:**
   - `kata-adding-phases` → `add-phase`
   - Pattern: Remove kata- prefix, convert gerund to imperative, singularize

2. **Check if command exists in `dev/transform/kata-staging/commands/kata/{command-name}.md`**

3. **If command does NOT exist:**
   - Create thin wrapper command:
     ```yaml
     ---
     name: {command-name}
     description: {first sentence from skill description}
     argument-hint: <description>
     version: 0.1.0
     disable-model-invocation: true
     allowed-tools:
       - Read
       - Write
       - Bash
     ---

     ## Step 1: Parse Context

     Arguments: "$ARGUMENTS"

     ## Step 2: Invoke Skill

     Run the following skill:
     `Skill("kata-{skill-name}")`
     ```

4. **If command EXISTS:** Skip (preserve manually created command)

**Name transformation algorithm (reverse of skill naming):**

```
skill_name → command_name:
  kata-adding-phases → add-phase
  kata-planning-phases → plan-phase
  kata-executing-plans → execute-plan
  kata-verifying-work → verify-work

Reverse gerund:
  - adding → add
  - planning → plan
  - executing → execute
  - verifying → verify
  - starting → start
  - debugging → debug

Singularization:
  - phases → phase
  - plans → plan
  - projects → project
```

Display: "✓ Step 5: Kata commands generated"

### Step 7: Validate

The validation will check:
- Agent frontmatter has kata- prefix
- No remaining GSD references
- Kata references exist
- Skills have complete frontmatter
- Kata commands exist
- Files in correct locations

Run validation:

```bash
cd /Users/gannonhall/dev/oss/kata
bash .claude/hooks/validate-gsd-transform.sh
```

If validation fails, STOP and display error message.

Display: "✓ Step 6: Validation complete"

### Step 8: Request Approval

Display summary:

```
═══════════════════════════════════════════════════════════
  TRANSFORMATION COMPLETE - AWAITING APPROVAL
═══════════════════════════════════════════════════════════

Kata-staging is ready for deployment:
  Location: dev/transform/kata-staging/

Validation: ✅ PASSED

Review the files in kata-staging/ before deploying.
You can inspect:
  - Agents: dev/transform/kata-staging/agents/
  - Skills: dev/transform/kata-staging/skills/
  - Commands: dev/transform/kata-staging/commands/kata/
  - Workflows: dev/transform/kata-staging/kata/

───────────────────────────────────────────────────────────
```

Use AskUserQuestion:
- Question: "Review validation results above. Deploy transformed files to final Kata destinations?"
- Options:
  1. label: "Yes, deploy now", description: "Copy files from kata-staging/ to agents/, skills/, commands/, etc."
  2. label: "No, let me review first", description: "Exit without deploying. Files remain in kata-staging/ for inspection."

If user selects "No":
- Display: "Files preserved in dev/transform/kata-staging/ for review. Run skill again to deploy."
- STOP

If user selects "Yes":
- Proceed to deployment step

### Step 9: Deploy

Deploy files from kata-staging/ to final destinations:

```bash
# Deploy agents
cp -r dev/transform/kata-staging/agents/* agents/

# Deploy commands
cp -r dev/transform/kata-staging/commands/kata/* commands/kata/

# Deploy workflows
cp -r dev/transform/kata-staging/kata/* kata/

# Deploy hooks
cp -r dev/transform/kata-staging/hooks/* hooks/

# Deploy scripts
cp -r dev/transform/kata-staging/scripts/* scripts/

# Deploy skills
cp -r dev/transform/kata-staging/skills/* skills/

# Deploy documentation
cp dev/transform/kata-staging/KATA-STYLE.md KATA-STYLE.md
cp dev/transform/kata-staging/CHANGELOG.md CHANGELOG-GSD.md
cp dev/transform/kata-staging/README.md README-GSD.md
```

Count deployed files:

```bash
echo "AGENTS=$(find agents -name 'kata-*.md' | wc -l | tr -d ' ')"
echo "COMMANDS=$(find commands/kata -name '*.md' | wc -l | tr -d ' ')"
echo "WORKFLOWS=$(find kata/workflows -name '*.md' | wc -l | tr -d ' ')"
echo "SKILLS=$(find skills/kata-* -name 'SKILL.md' | wc -l | tr -d ' ')"
```

Display completion summary:

```
═══════════════════════════════════════════════════════════
  GSD → KATA DEPLOYMENT COMPLETE
═══════════════════════════════════════════════════════════

Deployed files:
  Agents:    [N] files → agents/
  Commands:  [N] files → commands/kata/
  Workflows: [N] files → kata/
  Skills:    [N] files → skills/
  Hooks:     [N] files → hooks/
  Scripts:   [N] files → scripts/
  Docs:      3 files → KATA-STYLE.md, CHANGELOG-GSD.md, README-GSD.md

Next steps:
  1. Review deployed files
  2. Test commands with /kata:command-name
  3. Test skills by invoking naturally
  4. Commit changes when satisfied

───────────────────────────────────────────────────────────
```

## Success Criteria

- [ ] Latest GSD pulled from GitHub
- [ ] Files copied to gsd-source/ (reference)
- [ ] Files transformed to kata-staging/
- [ ] Text replacements applied (gsd → kata)
- [ ] GSD commands converted to Kata skills
- [ ] Skill frontmatter completed (version, user-invocable, etc.)
- [ ] Kata commands generated (thin wrappers)
- [ ] Validation passed all checks
- [ ] User reviewed validation results
- [ ] User approved deployment
- [ ] Files deployed to final destinations
- [ ] Deployment summary displayed
