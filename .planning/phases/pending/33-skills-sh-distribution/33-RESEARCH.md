# Phase 33 Research: skills.sh Distribution Channel

## Summary

Phase 33 adds a second distribution channel for Kata skills via the skills.sh registry. The `npx skills` CLI discovers skills from any GitHub repo containing `SKILL.md` files in a `skills/` directory. Publishing requires creating a `gannonh/kata-skills` repo, adapting the build to produce Agent Skills spec-compliant output, and extending CI to push there on release. The primary challenges are frontmatter compatibility (Claude Code uses fields the spec doesn't define) and naming/description optimization for cross-platform discovery.

## Standard Stack

### Agent Skills Specification (agentskills.io)
**Confidence: HIGH** (Source: agentskills.io official spec)

The open standard defines skill structure:

**Required frontmatter fields:**
- `name`: 1-64 chars, lowercase alphanumeric + hyphens, must match parent directory name, no consecutive hyphens, cannot start/end with hyphen
- `description`: 1-1024 chars, describes what the skill does and when to use it

**Optional frontmatter fields:**
- `license`: License name or reference to bundled file
- `compatibility`: Max 500 chars, environment requirements
- `metadata`: Arbitrary key-value mapping (string keys, string values)
- `allowed-tools`: Space-delimited list of pre-approved tools (experimental)

**Directory structure:**
```
skill-name/
├── SKILL.md          # Required
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
└── assets/           # Optional: templates, resources
```

### npx skills CLI (vercel-labs/skills)
**Confidence: HIGH** (Source: GitHub README, npm package)

The CLI discovers skills by scanning repos for `SKILL.md` files in standard locations:
- `skills/` (primary)
- `skills/.curated/`, `skills/.experimental/`, `skills/.system/`
- Agent-specific dirs: `.claude/skills/`, `.cursor/skills/`
- Recursive fallback if standard paths yield nothing

Installation commands:
```bash
npx skills add gannonh/kata-skills              # interactive
npx skills add gannonh/kata-skills --list       # preview
npx skills add gannonh/kata-skills --skill kata-plan-phase  # specific skill
npx skills add gannonh/kata-skills --all -y     # CI-friendly
npx skills add gannonh/kata-skills -a claude-code  # target agent
```

Skills install to:
- Project: `./<agent>/skills/` (e.g., `.claude/skills/`)
- Global: `~/<agent>/skills/` (with `-g` flag)

### skills.sh Registry
**Confidence: HIGH** (Source: skills.sh FAQ)

Skills appear on the skills.sh leaderboard automatically via anonymous CLI telemetry. No manual submission required. When users run `npx skills add gannonh/kata-skills`, the repo and its skills get indexed. Install counts power the leaderboard rankings.

URL structure: `skills.sh/gannonh/kata-skills/[skill-name]`

## Architecture Patterns

### Dual-Target Build

The build system needs a new target alongside the existing plugin build. Current flow:

```
Source (skills/) → build.js → dist/plugin/ → gannonh/kata-marketplace
```

New flow adds:

```
Source (skills/) → build.js → dist/skills-sh/ → gannonh/kata-skills
```

**Key difference:** The skills.sh target strips Claude Code-specific frontmatter fields and produces spec-compliant SKILL.md files. The plugin target keeps all fields as-is.

### Frontmatter Transformation

Current Kata SKILL.md frontmatter uses Claude Code extensions:
```yaml
name: kata-plan-phase
description: ...
metadata:
  version: "0.1.0"
user-invocable: true
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
```

Agent Skills spec-compliant version:
```yaml
name: kata-plan-phase
description: ...
license: MIT
compatibility: Designed for Claude Code. Requires project .planning/ directory.
metadata:
  author: gannonh
  version: "0.1.0"
allowed-tools: Read Write Bash
```

Fields to transform:
- `user-invocable`: Remove (Claude Code-specific)
- `disable-model-invocation`: Remove (Claude Code-specific)
- `allowed-tools`: Convert from YAML list to space-delimited string (spec format)
- `metadata`: Keep, add `author: gannonh`
- `license`: Add `MIT`
- `compatibility`: Add note about Claude Code design

### Skill Naming Strategy

Current names use `kata-` prefix (e.g., `kata-plan-phase`). This prefix is valid per the spec and serves two purposes:
1. Namespacing in Claude Code plugins (`kata:kata-plan-phase`)
2. Brand identity in skills.sh search results

**Recommendation: Keep `kata-` prefix.** The prefix passes spec validation (lowercase, hyphens, no consecutive hyphens). Removing it would create generic names (`plan-phase`, `execute-phase`) that clash with other skills on skills.sh. The `kata-` prefix aids discoverability.

### Description Optimization

Current descriptions are Claude Code trigger-optimized:
```
Execute all plans in a phase with wave-based parallelization, running phase execution, or completing phase work. Triggers include "execute phase", "run phase"...
```

For skills.sh, descriptions serve a different purpose: human discovery and cross-platform matching. The build transform should rewrite descriptions to remove "Triggers include..." suffix (Claude Code-specific trigger hints) and lead with what the skill does for a human audience.

**Approach:** Strip trigger phrases during build. The core description before "Triggers include" is already cross-platform friendly.

### Repo Structure for gannonh/kata-skills

```
gannonh/kata-skills/
├── README.md           # Installation instructions, skill catalog
├── LICENSE             # MIT
├── skills/
│   ├── kata-plan-phase/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── planner-instructions.md
│   │   │   └── ...
│   │   └── scripts/
│   │       └── update-issue-plans.py
│   ├── kata-execute-phase/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── ...
│   │   └── scripts/
│   │       └── find-phase.sh
│   ├── kata-help/
│   │   └── SKILL.md
│   └── ... (all 29 skills)
```

No `.claude-plugin/` directory needed. No `plugin.json` or `marketplace.json`. The `skills/` directory with valid `SKILL.md` files is sufficient for `npx skills` discovery.

### CI/CD Pipeline Extension

The existing `plugin-release.yml` pipeline:
1. Detects version change
2. Runs tests
3. Builds plugin
4. Creates GitHub Release
5. Pushes to `gannonh/kata-marketplace`

Extension for skills.sh:
1. Add new build step: `node scripts/build.js skills-sh`
2. Add validation step for spec compliance
3. Checkout `gannonh/kata-skills` repo
4. Sync built skills to repo
5. Commit and push

This mirrors the existing marketplace push pattern. Uses same `MARKETPLACE_TOKEN` (or a new `SKILLS_TOKEN`) for cross-repo push.

## Don't Hand-Roll

### YAML Frontmatter Parsing
Use the existing build.js string-based approach (read file, transform content, write file). The frontmatter is simple enough that a regex-based or split-based approach works. No need for a YAML parsing library.

### skills-ref Validation
The `agentskills/agentskills` repo provides a `skills-ref` CLI for validation:
```bash
skills-ref validate ./dist/skills-sh/skills/kata-plan-phase
```
This checks frontmatter compliance with the spec. Consider adding to CI but not strictly required for initial release.

### README Generation
Don't write the README manually. Generate it from the skill metadata during build. Extract name, description from each SKILL.md, format as a table.

## Common Pitfalls

### 1. Name Must Match Directory
**Confidence: HIGH** (Source: agentskills.io spec)

The spec requires: "Must match the parent directory name." If the `name` field says `kata-plan-phase`, the parent directory must be `kata-plan-phase/`. Current skills already follow this convention. The build just needs to preserve it.

### 2. Claude Code Fields Are Not Spec Fields
**Confidence: HIGH** (Source: agentskills.io spec vs code.claude.com docs)

`user-invocable`, `disable-model-invocation`, `context`, `agent`, `model`, `argument-hint`, and `hooks` are Claude Code extensions, not part of the Agent Skills spec. Other agents (Cursor, Codex, Copilot) ignore or may reject unknown fields. The build must strip Claude Code-specific fields.

**Risk level:** LOW. Unknown fields are likely ignored by most implementations, but stripping them is cleaner and prevents potential parsing issues.

### 3. allowed-tools Format Difference
**Confidence: HIGH**

Claude Code uses YAML list format:
```yaml
allowed-tools:
  - Read
  - Write
  - Bash
```

Agent Skills spec uses space-delimited string:
```yaml
allowed-tools: Read Write Bash
```

The build transform must handle this conversion. Note: the spec marks `allowed-tools` as experimental, and support varies across agents. Including it is fine but not relied upon.

### 4. Description Length and Content
**Confidence: MEDIUM**

Skills.sh displays truncated descriptions (~150 chars visible in card view). Long descriptions with trigger phrases waste this space. The first ~150 characters should convey what the skill does for a human reader, not list trigger words.

### 5. Hooks Directory Won't Transfer
**Confidence: HIGH**

The current plugin distribution includes `hooks/` (status line, setup). These are Claude Code plugin hooks, not Agent Skills resources. The skills.sh build should exclude `hooks/` entirely. The `gannonh/kata-skills` repo contains only `skills/`, `README.md`, and `LICENSE`.

### 6. @-References May Not Resolve Cross-Platform
**Confidence: MEDIUM**

Skills use `@./references/file.md` references within SKILL.md. Claude Code resolves these. Other agents may not support `@` reference syntax. This is an inherent cross-platform limitation. The skill content still works since the referenced files are bundled, and agents can read them when instructed. No build transformation needed, but descriptions should mention "designed for Claude Code" via the `compatibility` field.

### 7. Cross-Repo Push Requires PAT
**Confidence: HIGH**

The CI needs to push to `gannonh/kata-skills` from `gannonh/kata-orchestrator`. The default `GITHUB_TOKEN` only has permissions for the current repo. A Personal Access Token (PAT) or fine-grained token scoped to `kata-skills` must be stored as a repository secret. The existing `MARKETPLACE_TOKEN` secret may work if it covers the new repo, or a new secret is needed.

## Code Examples

### Build Transform: Strip Claude Code Fields

```javascript
function transformForSkillsSh(content) {
  // Split frontmatter from body
  const parts = content.split('---');
  if (parts.length < 3) return content;

  let frontmatter = parts[1];
  const body = parts.slice(2).join('---');

  // Remove Claude Code-specific fields
  frontmatter = frontmatter.replace(/^user-invocable:.*$/m, '');
  frontmatter = frontmatter.replace(/^disable-model-invocation:.*$/m, '');

  // Convert allowed-tools from YAML list to space-delimited
  const toolsMatch = frontmatter.match(/^allowed-tools:\n((?:\s+-\s+.*\n)*)/m);
  if (toolsMatch) {
    const tools = toolsMatch[1].match(/- (.+)/g)
      ?.map(t => t.replace('- ', '').trim()) || [];
    frontmatter = frontmatter.replace(
      toolsMatch[0],
      `allowed-tools: ${tools.join(' ')}\n`
    );
  }

  // Add license and compatibility if not present
  if (!frontmatter.includes('license:')) {
    frontmatter += 'license: MIT\n';
  }
  if (!frontmatter.includes('compatibility:')) {
    frontmatter += 'compatibility: Designed for Claude Code. Requires project .planning/ directory.\n';
  }

  // Strip trigger phrases from description
  frontmatter = frontmatter.replace(
    /(description:.*?)(?:\s*Triggers include.*?)(?=\n\w|\n---)/s,
    '$1'
  );

  // Clean up empty lines
  frontmatter = frontmatter.replace(/\n{3,}/g, '\n\n');

  return `---${frontmatter}---${body}`;
}
```

### CI Step: Push to kata-skills

```yaml
- name: Build skills.sh distribution
  if: steps.check.outputs.should_publish == 'true'
  run: node scripts/build.js skills-sh

- name: Checkout kata-skills
  if: steps.check.outputs.should_publish == 'true'
  uses: actions/checkout@v4
  with:
    repository: gannonh/kata-skills
    token: ${{ secrets.SKILLS_TOKEN }}
    path: kata-skills

- name: Update kata-skills with built skills
  if: steps.check.outputs.should_publish == 'true'
  run: |
    rm -rf kata-skills/skills
    cp -r dist/skills-sh/skills kata-skills/skills
    cp dist/skills-sh/README.md kata-skills/README.md

- name: Commit and push to kata-skills
  if: steps.check.outputs.should_publish == 'true'
  working-directory: kata-skills
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add -A
    git diff --staged --quiet || git commit -m "chore: update kata skills to v${{ steps.version.outputs.plugin_version }}"
    git push
```

## State of the Art

The Agent Skills ecosystem is rapidly growing. As of February 2026:

- **skills.sh** indexes repos automatically via CLI telemetry. No manual submission process.
- **npx skills** supports 38+ agents (Claude Code, Cursor, Codex, Copilot, Roo Code, and others)
- **anthropics/skills** (Anthropic's reference repo) has 17 skills with 150.9K total installs
- **vercel-labs/agent-skills** provides curated Vercel skills as a separate collection
- Cross-platform compatibility is the primary value proposition of the Agent Skills spec

Kata's skills are inherently Claude Code-native (they use `@` references, spawn subagents via Task tool, use Claude Code-specific frontmatter). The skills.sh channel primarily serves Claude Code users who prefer `npx skills add` over `/plugin install`. Cross-platform use is limited by Claude Code-specific patterns in skill bodies, but the `compatibility` field makes this explicit.

## Open Questions

1. **Should internal/infrastructure skills be excluded?** Skills like `kata-migrate-phases` are internal maintenance tools. Including them in the public skills.sh listing adds noise. Consider adding `metadata.internal: true` to exclude them from `npx skills add --list` output (the CLI supports this via `INSTALL_INTERNAL_SKILLS=1`).

2. **Should the kata-skills repo be created manually first?** The CI pipeline pushes to it, so it must exist before the first release. Create it manually with a README stub, or have the CI create it if missing.

3. **Should we validate with skills-ref?** The `agentskills/agentskills` repo provides a validation CLI. Adding it to CI ensures spec compliance but adds a dependency. Worth considering for build validation.

4. **Token scope:** Can the existing `MARKETPLACE_TOKEN` push to `gannonh/kata-skills`, or does a new fine-grained token need to be created?

## Sources

- [Agent Skills Specification](https://agentskills.io/specification) - Official spec for SKILL.md format
- [Agent Skills Overview](https://agentskills.io/what-are-skills) - How skills work
- [Agent Skills Integration Guide](https://agentskills.io/integrate-skills) - How agents discover and load skills
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) - Claude Code-specific extensions
- [npx skills CLI (vercel-labs/skills)](https://github.com/vercel-labs/skills) - CLI source and documentation
- [Anthropic Skills Repo](https://github.com/anthropics/skills) - Reference implementation
- [skills.sh Registry](https://skills.sh) - Skills directory and leaderboard
- [skills.sh FAQ](https://skills.sh/docs/faq) - How skills get indexed
- [skills.sh CLI Docs](https://skills.sh/docs/cli) - CLI reference

## Metadata

- **Researcher:** kata-phase-researcher (Claude Opus 4.6)
- **Date:** 2026-02-06
- **Phase:** 33 - skills.sh Distribution Channel
- **Tools used:** WebSearch, WebFetch, Read, Glob, Bash
- **Confidence distribution:** HIGH: 80%, MEDIUM: 15%, LOW: 5%
