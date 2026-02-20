# Plan: Kata Test Project Generator Script

Create an interactive bash script that generates test projects in various Kata workflow states for UAT testing.

## Location

**Script:** `/Users/gannonhall/dev/kata/kata-burner/create-test-project.sh`

**Output:** Test projects created in `/Users/gannonhall/dev/kata/kata-burner/test-{state}-{timestamp}/`

## Project States to Support

| # | State | Description | Key Files Added |
|---|-------|-------------|-----------------|
| 1 | Greenfield | Empty folder | None |
| 2 | Post-Init | After `/kata-new-project` | PROJECT.md, config.json |
| 3 | Milestone Defined | After `/kata-add-milestone` | + ROADMAP.md, REQUIREMENTS.md, STATE.md |
| 4 | Phase Planned | After `/kata-plan-phase` | + phases/01-*/01-PLAN.md |
| 5 | Phase In Progress | Mid-execution | + partial SUMMARY.md |
| 6 | Phase Complete | Execution done | + all SUMMARY.md, VERIFICATION.md |
| 7 | Ready for UAT | Verified, no UAT yet | Same as 6, different STATE.md |
| 8 | UAT Complete | After UAT | + UAT.md |
| 9 | Milestone Near Complete | All phases done | + second phase complete |
| 10 | Between Milestones | After `/kata-complete-milestone` | + milestones/ archive |
| 11 | Brownfield | Existing code + any state | + src/, package.json |

## Configuration Options

Interactive menu to set before project creation:

| Option | Values | Default |
|--------|--------|---------|
| mode | yolo, interactive | yolo |
| depth | quick, standard, comprehensive | standard |
| model_profile | quality, balanced, budget | balanced |
| pr_workflow | true, false | false |
| github.enabled | true, false | false |

## Script Architecture

```
create-test-project.sh
├── Configuration variables (defaults)
├── Helper functions
│   ├── generate_project_name()
│   ├── create_directory_structure()
│   └── init_git_repo()
├── File template functions
│   ├── write_project_md()
│   ├── write_config_json()
│   ├── write_state_md()
│   ├── write_roadmap_md()
│   ├── write_requirements_md()
│   ├── write_plan_md()
│   ├── write_summary_md()
│   ├── write_verification_md()
│   ├── write_uat_md()
│   └── write_research_md()
├── State builder functions (incremental)
│   ├── build_greenfield()
│   ├── build_post_init() → calls build_greenfield
│   ├── build_milestone_defined() → calls build_post_init
│   ├── build_phase_planned() → calls build_milestone_defined
│   ├── build_phase_in_progress() → calls build_phase_planned
│   ├── build_phase_complete() → calls build_phase_in_progress
│   ├── build_ready_for_uat() → calls build_phase_complete
│   ├── build_uat_complete() → calls build_phase_complete
│   ├── build_milestone_near_complete() → calls build_uat_complete
│   ├── build_between_milestones() → calls build_milestone_near_complete
│   └── build_brownfield() → calls any state + adds code
├── Menu functions
│   ├── show_main_menu()
│   ├── show_config_menu()
│   └── configure_settings()
└── main()
```

## Key Implementation Details

### 1. State Builder Pattern (Incremental)

Each state builder calls its predecessor, ensuring consistency:

```bash
build_phase_complete() {
    local project_dir="$1"
    build_phase_in_progress "${project_dir}"  # Get all prior files
    write_summary_md "${project_dir}" "01" "02" "complete"
    write_verification_md "${project_dir}" "01"
    write_state_md "${project_dir}" "phase-complete"
}
```

### 2. Naming Convention

```
test-{state-slug}-{YYYYMMDD}-{HHMMSS}
# Example: test-phase-planned-20260202-143215
```

### 3. Git Initialization

Every project gets `git init` + initial commit (except greenfield which stays empty).

### 4. Variable Substitution in Templates

Use heredocs with variable expansion for dynamic content:

```bash
write_config_json() {
    cat > "${project_dir}/.planning/config.json" << EOF
{
  "mode": "${CONFIG_MODE}",
  "depth": "${CONFIG_DEPTH}",
  ...
}
EOF
}
```

## Reference Files

Templates should match patterns from:

- `.planning/config.json` — config schema
- `.planning/STATE.md` — state format with progress bar
- `.planning/phases/01-pr-issue-closure/01-01-PLAN.md` — plan frontmatter
- `.planning/phases/.archive/*/` — summary/verification format

## Tasks

### Task 1: Create script skeleton

Create `create-test-project.sh` with:
- Shebang and strict mode (`set -euo pipefail`)
- Configuration variables with defaults
- Main menu display function
- Configuration submenu function
- `main()` entry point with menu loop

### Task 2: Implement file template functions

Create template functions for each file type:
- `write_project_md()` — minimal but realistic PROJECT.md
- `write_config_json()` — uses CONFIG_* variables
- `write_state_md()` — accepts state parameter, generates appropriate content
- `write_roadmap_md()` — simple 2-phase milestone
- `write_requirements_md()` — 3 test requirements
- `write_plan_md()` — 2 tasks with proper frontmatter
- `write_summary_md()` — with commit hash placeholder
- `write_verification_md()` — 3/3 must-haves verified
- `write_uat_md()` — 5 test cases, all pass
- `write_research_md()` — brief research findings

### Task 3: Implement state builders

Create incremental builder functions:
- `build_greenfield()` through `build_brownfield()`
- Each calls predecessor then adds state-specific files
- Brownfield adds src/index.js, tests/, package.json

### Task 4: Wire up menus and main loop

Connect everything:
- Main menu reads selection, calls `configure_settings()`
- After config, calls appropriate builder
- Initializes git, displays success message

## Verification

After implementation:

```bash
# Make executable
chmod +x /Users/gannonhall/dev/kata/kata-burner/create-test-project.sh

# Test each state
cd /Users/gannonhall/dev/kata/kata-burner
./create-test-project.sh

# Verify generated project structure
ls -la test-phase-planned-*/
ls -la test-phase-planned-*/.planning/
ls -la test-phase-planned-*/.planning/phases/

# Verify config.json has correct values
cat test-*/. planning/config.json

# Verify git initialized
cd test-*/ && git log --oneline
```

## Success Criteria

- [ ] Script runs interactively with clear menus
- [ ] All 11 states generate correct file structures
- [ ] Configuration options are reflected in config.json
- [ ] STATE.md content matches selected state
- [ ] Git repo initialized with initial commit
- [ ] Generated projects can be used with Kata skills
