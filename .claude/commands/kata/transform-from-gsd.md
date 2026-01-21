---
name: kata:transform-from-gsd
description: Transform get-shit-done files to kata format with validation and approval before deployment
argument-hint: ""
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Skill
  - AskUserQuestion
hooks:
  Stop:
    - matcher: ""
      hooks:
        - type: command
          command: .claude/hooks/validate-gsd-transform.sh
---

<objective>
Orchestrate complete transformation of get-shit-done (GSD) repository files into Kata format.

**New workflow:**
1. Pull latest GSD from GitHub
2. Copy to `gsd-source/` (reference) and transform to `kata-staging/`
3. Run text replacements on kata-staging/
4. Convert GSD commands to Kata skills
5. Post-process skill frontmatter (add version, user-invocable, disable-model-invocation)
6. Generate Kata commands (thin wrappers)
7. Validate transformation
8. Request user approval
9. Deploy to final destinations if approved

All transformations happen in `kata-staging/` before deployment. User reviews validation results and approves deployment.
</objective>

<context>
**Source:** `/Users/gannonhall/dev/oss/get-shit-done`

**Staging:** `/Users/gannonhall/dev/oss/kata/dev/transform/`
- `gsd-source/` - Pristine copy of GSD repo
- `kata-staging/` - Transformed files ready for deployment

**Scripts:**
- @dev/transform-gsd-to-kata.py — Copy and transform
- @dev/replace-gsd-with-kata.py — Text replacement
- @dev/post-process-skill-frontmatter.py — Add skill frontmatter
- @dev/generate-kata-commands.py — Generate Kata commands

**Skill:**
- converting-commands-to-skills — Command→skill conversion

**Hook:**
- @.claude/hooks/validate-gsd-transform.sh — Validation (runs automatically)
</context>

<process>

<step name="pull_latest_gsd">
Pull latest GSD from GitHub:

```bash
cd /Users/gannonhall/dev/oss/get-shit-done
git pull origin main
```

Display git pull output.

If pull fails, display error and STOP.
</step>

<step name="copy_and_transform">
Run transformation script to copy GSD→gsd-source and transform→kata-staging:

```bash
cd /Users/gannonhall/dev/oss/kata
python3 dev/transform-gsd-to-kata.py
```

This creates:
- `dev/transform/gsd-source/` - Full copy of GSD repo
- `dev/transform/kata-staging/` - Transformed files (agents renamed, etc.)

Display script output showing file counts.

Display: "✓ Step 1: Files copied and transformed"
</step>

<step name="replace_text">
Run text replacement on kata-staging/ to replace all GSD references:

```bash
cd /Users/gannonhall/dev/oss/kata/dev/transform/kata-staging
python3 ../../../dev/replace-gsd-with-kata.py
cd ../../..
```

This processes all files in kata-staging/:
- agents/
- kata/ (workflows)
- hooks/
- scripts/
- KATA-STYLE.md
- etc.

Display replacement counts.

Display: "✓ Step 2: Text replaced (gsd → kata)"
</step>

<step name="convert_to_skills">
Convert GSD commands to Kata skills using the converting-commands-to-skills skill.

First, copy GSD commands to kata-staging for conversion:

```bash
cp -r dev/transform/gsd-source/commands/gsd dev/transform/kata-staging/commands/
```

Then invoke skill:

Use Skill tool with:
- skill: "converting-commands-to-skills"
- args: "/Users/gannonhall/dev/oss/kata/dev/transform/kata-staging"

When asked "Do you want a basic conversion or full conversion?", select "basic" (frontmatter + directory only, preserve content).

Skills will be created in `dev/transform/kata-staging/skills/`

Display: "✓ Step 3: Commands converted to skills"
</step>

<step name="post_process_skills">
Add missing frontmatter fields to skills:

```bash
python3 dev/post-process-skill-frontmatter.py
```

Adds to each skill:
- version: 0.1.0
- user-invocable: false
- disable-model-invocation: false
- allowed-tools: [Read, Write, Bash]

Display script output showing skills updated.

Display: "✓ Step 4: Skill frontmatter completed"
</step>

<step name="generate_commands">
Generate Kata commands (thin wrappers that invoke skills):

```bash
python3 dev/generate-kata-commands.py
```

Creates commands in `dev/transform/kata-staging/commands/kata/`

Display script output showing commands generated.

Display: "✓ Step 5: Kata commands generated"
</step>

<step name="validate">
Run validation hook (runs automatically via Stop hook):

The validation hook will check:
- Agent frontmatter has kata- prefix
- No remaining GSD references
- Kata references exist
- Skills have complete frontmatter
- Kata commands exist
- Files in correct locations

Hook output will be displayed automatically.

If validation fails, STOP and display error message.

Display: "✓ Step 6: Validation complete"
</step>

<step name="request_approval">
Display summary and request user approval for deployment:

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
- Display message: "Files preserved in dev/transform/kata-staging/ for review. Run command again to deploy."
- STOP

If user selects "Yes":
- Proceed to deployment step
</step>

<step name="deploy">
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

Display: "✓ Step 7: Deployed to final destinations"
</step>

<step name="completion">
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

Replace [N] with actual counts from bash output.
</step>

</process>

<success_criteria>
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
</success_criteria>

<note>
The transformation is automatically validated by a Stop hook (`.claude/hooks/validate-gsd-transform.sh`) before requesting user approval.

Files remain in `kata-staging/` until user approves deployment, preventing accidental overwrites of production files.
</note>
