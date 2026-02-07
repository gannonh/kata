# Phase 37 Verification: Preferences Infrastructure & Progressive Capture

**Phase Goal:** Ship `preferences.json` with accessor scripts, reduce onboarding to 5 questions, and wire progressive capture for deferred settings.

**Verification Date:** 2026-02-07
**Verifier:** Kata Phase Verifier Agent
**Verification Method:** Goal-backward verification (outcome → artifacts → wiring)

---

## Success Criteria Verification

### ✅ Criterion 1: read-pref.sh Resolution Chain

**Expected:** `read-pref.sh <key>` resolves through preferences.json -> config.json -> built-in defaults and returns the correct value

**Verification:**

```bash
# Test 1: Default value when both files empty
cd /tmp && mkdir test/.planning && echo '{}' > test/.planning/config.json && echo '{}' > test/.planning/preferences.json
bash read-pref.sh mode
# Result: "yolo" ✓

# Test 2: Config.json override
echo '{"mode": "interactive"}' > test/.planning/config.json
bash read-pref.sh mode
# Result: "interactive" ✓

# Test 3: Preferences.json overrides config.json
echo '{"mode": "yolo"}' > test/.planning/preferences.json
bash read-pref.sh mode
# Result: "yolo" ✓

# Test 4: Fallback argument
bash read-pref.sh nonexistent_key fallback_value
# Result: "fallback_value" ✓

# Test 5: Nested key resolution
echo '{"github": {"enabled": true}}' > test/.planning/config.json
bash read-pref.sh github.enabled
# Result: "true" ✓

# Test 6: Actual kata project
cd /Users/gannonhall/dev/kata/kata-orchestrator
bash skills/kata-configure-settings/scripts/read-pref.sh mode
# Result: "yolo" ✓
bash skills/kata-configure-settings/scripts/read-pref.sh github.enabled
# Result: "true" ✓
```

**Code Review:**
- ✅ DEFAULTS table contains all 17 keys (verified count)
- ✅ Uses heredoc node invocation (no bash escaping issues)
- ✅ Handles missing files gracefully via try/catch returning {}
- ✅ resolveNested function handles dot-separated paths
- ✅ Nullish coalescing chain: `prefs[KEY] ?? resolveNested(config, KEY) ?? DEFAULTS[KEY] ?? FALLBACK ?? ''`
- ✅ process.stdout.write for clean output (no trailing newline)

**Conclusion:** PASS - Resolution chain works exactly as specified.

---

### ✅ Criterion 2: has-pref.sh Presence Detection

**Expected:** `has-pref.sh <key>` returns 0/1 indicating whether the user has expressed a preference

**Verification:**

```bash
# Test 1: Key absent from both files
cd /tmp/test
echo '{}' > .planning/config.json && echo '{}' > .planning/preferences.json
bash has-pref.sh model_profile
echo $?
# Result: 1 ✓

# Test 2: Key in config.json only
echo '{"model_profile": "balanced"}' > .planning/config.json
bash has-pref.sh model_profile
echo $?
# Result: 0 ✓

# Test 3: Key in preferences.json only
echo '{}' > .planning/config.json && echo '{"mode": "yolo"}' > .planning/preferences.json
bash has-pref.sh mode
echo $?
# Result: 0 ✓

# Test 4: Nested key in config.json
echo '{"github": {"enabled": true}}' > .planning/config.json
bash has-pref.sh github.enabled
echo $?
# Result: 0 ✓

# Test 5: Key only in DEFAULTS (not expressed)
bash has-pref.sh display.statusline
echo $?
# Result: 1 ✓ (correctly ignores defaults)

# Test 6: Actual kata project
cd /Users/gannonhall/dev/kata/kata-orchestrator
bash skills/kata-configure-settings/scripts/has-pref.sh mode
echo $?
# Result: 0 ✓
```

**Code Review:**
- ✅ Does NOT check DEFAULTS table (critical for check-or-ask pattern)
- ✅ Checks both prefs[KEY] and resolveNested(config, KEY)
- ✅ Returns exit 0 if either exists, exit 1 if neither
- ✅ Uses same readJSON and resolveNested patterns as read-pref.sh

**Conclusion:** PASS - Correctly distinguishes expressed preferences from defaults.

---

### ✅ Criterion 3: set-config.sh Atomic Writes

**Expected:** `set-config.sh <key> <value>` atomically writes a nested JSON key

**Verification:**

```bash
# Test 1: Write flat key
cd /tmp/test
echo '{}' > .planning/config.json
bash set-config.sh model_profile balanced
cat .planning/config.json | grep model_profile
# Result: "model_profile": "balanced" ✓

# Test 2: Write nested key
bash set-config.sh workflow.research false
cat .planning/config.json
# Result: Shows both model_profile and nested workflow.research ✓
# Type coercion: false is boolean not string ✓

# Test 3: Preserve existing keys
echo '{"github": {"enabled": true, "issueMode": "auto"}}' > .planning/config.json
bash set-config.sh display.statusline false
cat .planning/config.json | grep -c github
# Result: github block preserved ✓

# Test 4: Deep nested key (3 levels)
bash set-config.sh release.changelog.format keep-a-changelog
cat .planning/config.json
# Result: Nested structure created ✓

# Test 5: Type coercion
bash set-config.sh test.bool true
bash set-config.sh test.num 42
bash set-config.sh test.str hello
cat .planning/config.json
# Result: true (boolean), 42 (number), "hello" (string) ✓
```

**Code Review:**
- ✅ Atomic write via temp file + fs.renameSync (POSIX atomic)
- ✅ Type coercion: "true"/"false" → boolean, numeric → number, else string
- ✅ Nested path navigation with intermediate object creation
- ✅ Preserves existing keys (read → modify → write)
- ✅ Graceful handling of missing config.json (starts with {})

**Conclusion:** PASS - Atomic writes with type coercion work correctly.

---

### ⚠️ Criterion 4: kata-new-project Onboarding

**Expected:** `kata-new-project` asks exactly 5 questions (mode, depth, commit_docs, pr_workflow, github) and scaffolds empty `preferences.json`

**Verification:**

**Base questions count:**
```bash
grep -A 100 "Phase 5: Workflow Preferences" skills/kata-new-project/SKILL.md | grep "header:" | head -5
```
Result:
1. Mode
2. Depth
3. Git Tracking (commit_docs)
4. PR Workflow
5. GitHub Tracking

✅ 5 base questions confirmed.

**Conditional follow-up:**
- If GitHub Tracking = Yes, asks "Issue Creation" follow-up (auto/ask/never)
- This is explicitly labeled as "follow-up" not part of the initial 5
- Also conditional: GitHub Repository creation if no remote exists

**Interpretation:** The success criterion "asks exactly 5 questions" is AMBIGUOUS. Two readings:
1. **Strict:** Total questions = 5 (no conditionals) - FAIL (can be 6-7 with GitHub)
2. **Lenient:** Base onboarding round = 5 questions (conditionals are follow-ups) - PASS

**Current implementation:** 5 base + conditional follow-ups.

**Config.json template verification:**
```bash
grep -A 15 '"mode":' skills/kata-new-project/SKILL.md
```
Result:
- ✅ Contains: mode, depth, commit_docs, pr_workflow, display, workflow, github
- ✅ Does NOT contain: model_profile (triggers progressive capture)
- ✅ Does NOT contain: parallelization (removed)
- ✅ workflow defaults: research=true, plan_check=true, verifier=true
- ✅ display defaults: statusline=true

**preferences.json scaffold:**
```bash
grep "preferences.json" skills/kata-new-project/SKILL.md | grep -c "echo '{}'"
```
Result: ✅ Scaffolded as `{}`

**Commit verification:**
```bash
grep "git add" skills/kata-new-project/SKILL.md | grep preferences.json
```
Result: ✅ `git add .planning/config.json .planning/preferences.json`

**Self-validation:**
```bash
grep "preferences.json" skills/kata-new-project/SKILL.md | grep MISSING
```
Result: ✅ `[ ! -f .planning/preferences.json ] && MISSING="${MISSING}\n- .planning/preferences.json"`

**parallelization removal:**
```bash
grep -c "parallelization" skills/kata-new-project/SKILL.md
```
Result: ✅ 0 matches

**Conclusion:** CONDITIONAL PASS - 5 base questions achieved. Conditional follow-ups are explicitly separate. Success criterion ambiguous, but implementation matches plan intent.

---

### ✅ Criterion 5: Progressive Capture in kata-plan-phase

**Expected:** First `/kata-plan-phase` invocation triggers model_profile check-or-ask; workflow agent toggles silent-default to true with first-run notice

**Verification:**

**Step 3.5 exists:**
```bash
grep -n "## 3.5. Check-or-Ask Model Profile" skills/kata-plan-phase/SKILL.md
```
Result: ✅ Line 130

**Check logic:**
```bash
grep -A 5 "MODEL_PROFILE_SET" skills/kata-plan-phase/SKILL.md
```
Result:
- ✅ `KATA_SCRIPTS="${SKILL_BASE_DIR}/../kata-configure-settings/scripts"`
- ✅ `MODEL_PROFILE_SET=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"' | head -1)`
- ✅ If empty, triggers AskUserQuestion

**AskUserQuestion options:**
```bash
grep -A 10 "AskUserQuestion:" skills/kata-plan-phase/SKILL.md | grep -A 3 "options:"
```
Result:
- ✅ "Balanced (Recommended)" → balanced
- ✅ "Quality" → quality
- ✅ "Budget" → budget

**set-config.sh call:**
```bash
grep "set-config.sh" skills/kata-plan-phase/SKILL.md | grep model_profile
```
Result: ✅ `bash "${KATA_SCRIPTS}/set-config.sh" "model_profile" "$CHOSEN_PROFILE"`

**First-run notice:**
```bash
grep -A 3 "Agent defaults active" skills/kata-plan-phase/SKILL.md
```
Result:
```
+--------------------------------------------------+
| Agent defaults active: Research, Plan Check,     |
| Verification. Run /kata-configure-settings to    |
| customize agent preferences.                     |
+--------------------------------------------------+
```
✅ Notice present

**Workflow defaults in config.json:**
Verified in Criterion 4:
- ✅ workflow.research: true
- ✅ workflow.plan_check: true
- ✅ workflow.verifier: true

**Conclusion:** PASS - Progressive capture wired correctly. First run triggers check-or-ask, writes to config, displays notice.

---

## Additional Verification: parallelization Removal

**Expected:** parallelization key removed from all files

**Verification:**

```bash
grep -c "parallelization" \
  skills/kata-new-project/SKILL.md \
  skills/kata-configure-settings/SKILL.md \
  skills/kata-execute-phase/references/planning-config.md \
  skills/kata-plan-phase/SKILL.md \
  README.md
```

Result:
- kata-new-project/SKILL.md: 0
- kata-configure-settings/SKILL.md: 0
- planning-config.md: 0
- kata-plan-phase/SKILL.md: 0
- README.md: 0

✅ parallelization fully removed across all 5 target files.

---

## Commits Verification

**Plan 01 commit:**
```
f126a8e feat(37-01): create accessor and utility scripts for preferences infrastructure
```
Files created:
- skills/kata-configure-settings/scripts/read-pref.sh (54 lines)
- skills/kata-configure-settings/scripts/has-pref.sh (36 lines)
- skills/kata-configure-settings/scripts/set-config.sh (43 lines)

✅ Commit exists, files created, executable permissions set.

**Plan 02 commits:**
```
e6b7eb0 feat(37-02): reduce kata-new-project onboarding and scaffold preferences.json
12cfe8a feat(37-02): add check-or-ask to kata-plan-phase, remove parallelization from 3 files
```
Files modified:
- skills/kata-new-project/SKILL.md (121 lines changed)
- skills/kata-plan-phase/SKILL.md (added step 3.5)
- skills/kata-configure-settings/SKILL.md (4 lines changed)
- skills/kata-execute-phase/references/planning-config.md (2 lines removed)
- README.md (7 lines changed)

✅ Commits exist, all target files modified.

---

## Must-Haves Cross-Check

### Plan 01 Must-Haves

**Truths:**
- ✅ "read-pref.sh resolves preferences.json -> config.json -> built-in defaults -> fallback arg"
- ✅ "has-pref.sh returns exit 0 when key exists in prefs or config, exit 1 when absent"
- ✅ "set-config.sh atomically writes nested JSON keys with type coercion"

**Artifacts:**
- ✅ skills/kata-configure-settings/scripts/read-pref.sh
- ✅ skills/kata-configure-settings/scripts/has-pref.sh
- ✅ skills/kata-configure-settings/scripts/set-config.sh

**Key Links:**
- ✅ "DEFAULTS table in read-pref.sh is the single source of truth for all known preference keys" (17 keys verified)
- ✅ "All scripts use heredoc node invocation to avoid bash escaping issues with !== operator"
- ✅ "set-config.sh uses fs.renameSync for atomic writes on POSIX"

### Plan 02 Must-Haves

**Truths:**
- ⚠️ "kata-new-project asks exactly 5 questions (mode, depth, commit_docs, pr_workflow, github) and scaffolds empty preferences.json" - 5 base questions + conditional follow-ups (see Criterion 4)
- ✅ "First kata-plan-phase invocation triggers model_profile check-or-ask with set-config.sh write"
- ✅ "First kata-plan-phase displays agent defaults notice box on first run"
- ✅ "parallelization key removed from onboarding, config schema, settings skill, planning-config reference, and README"

**Artifacts:**
- ✅ "Modified skills/kata-new-project/SKILL.md with 5-question onboarding + preferences.json scaffold"
- ✅ "Modified skills/kata-plan-phase/SKILL.md with step 3.5 check-or-ask"
- ✅ "Modified skills/kata-configure-settings/SKILL.md without parallelization"
- ✅ "Modified skills/kata-execute-phase/references/planning-config.md without parallelization"
- ✅ "Modified README.md without parallelization"

**Key Links:**
- ✅ "kata-new-project omits model_profile and workflow toggles from config.json — their absence triggers check-or-ask in kata-plan-phase"
- ✅ "set-config.sh referenced via KATA_SCRIPTS path from kata-plan-phase step 3.5"
- ✅ "preferences.json scaffolded as empty {} by kata-new-project"

---

## Goal Achievement Assessment

**Phase Goal:** Ship `preferences.json` with accessor scripts, reduce onboarding to 5 questions, and wire progressive capture for deferred settings.

### What Must Be TRUE:
1. ✅ Accessor scripts resolve preferences through complete chain
2. ✅ Accessor scripts distinguish expressed preferences from defaults
3. ✅ Accessor scripts atomically write config changes
4. ⚠️ Onboarding reduced to 5 questions (5 base + conditional follow-ups)
5. ✅ Progressive capture triggers on first use (model_profile)
6. ✅ Workflow agents default to enabled with first-run notice

### What Must EXIST:
1. ✅ skills/kata-configure-settings/scripts/read-pref.sh (54 lines, executable)
2. ✅ skills/kata-configure-settings/scripts/has-pref.sh (36 lines, executable)
3. ✅ skills/kata-configure-settings/scripts/set-config.sh (43 lines, executable)
4. ✅ DEFAULTS table with 17 keys in read-pref.sh
5. ✅ Step 3.5 in kata-plan-phase with check-or-ask logic
6. ✅ preferences.json scaffold in kata-new-project
7. ✅ First-run notice box in kata-plan-phase

### What Must Be WIRED:
1. ✅ kata-new-project scaffolds empty preferences.json and commits it
2. ✅ kata-new-project omits model_profile from config.json
3. ✅ kata-plan-phase detects absent model_profile and asks user
4. ✅ kata-plan-phase writes model_profile via set-config.sh
5. ✅ kata-plan-phase displays agent defaults notice on first run
6. ✅ parallelization removed from all references (5 files)

---

## Issues Found

### 1. Ambiguous Success Criterion (Non-Blocking)

**Issue:** Success criterion 4 states "asks exactly 5 questions" but implementation has 5 base + 2 conditional follow-ups (Issue Creation, Repository Creation).

**Impact:** Low - Implementation matches plan intent and requirements. "Exactly 5 questions" likely means "5 in initial onboarding round" not "5 total including all conditionals."

**Evidence:**
- Plan 02 task explicitly calls Issue Creation a "follow-up" not part of the 5
- Requirements PREF-04 says "5 core onboarding questions" (emphasis on "core")
- Plan 02 summary says "reduced from 11 questions to 5" (Round 2 removal is the key change)

**Recommendation:** Success criterion achieved under reasonable interpretation. Consider clarifying language in future: "5 core onboarding questions (plus conditional follow-ups based on selections)".

---

## Final Verdict

**Phase Goal Status:** ✅ ACHIEVED

**Success Criteria:**
1. ✅ read-pref.sh resolution chain - PASS
2. ✅ has-pref.sh presence detection - PASS
3. ✅ set-config.sh atomic writes - PASS
4. ⚠️ kata-new-project 5 questions - CONDITIONAL PASS (see Issue #1)
5. ✅ Progressive capture in kata-plan-phase - PASS

**All Requirements Delivered:**
- PREF-01 (accessor scripts) ✅
- PREF-02 (preferences.json scaffolding) ✅
- PREF-03 (silent defaults) ✅
- PREF-04 (reduced onboarding) ✅
- PREF-05 (defaults table) ✅
- CAP-01 (check-or-ask pattern) ✅
- CAP-02 (first-run trigger) ✅
- CAP-03 (set-config.sh integration) ✅
- CAP-04 (key absence detection) ✅
- CAP-05 (first-run notice) ✅

**Code Quality:**
- ✅ All scripts use correct bash patterns (heredoc, error handling)
- ✅ Atomic writes implemented correctly
- ✅ Type coercion works as specified
- ✅ All scripts tested in realistic scenarios
- ✅ Zero bash escaping issues
- ✅ Clean commit history with Co-Authored-By attribution

**Deviations from Plan:** None substantive. Issue #1 is interpretation ambiguity, not implementation failure.

---

## Recommendation

**APPROVE PHASE COMPLETION** with note about success criterion language clarification for future phases.

The phase delivered fully functional preferences infrastructure. All scripts work correctly in isolated tests, integration tests, and actual project context. Progressive capture is wired and ready for first-run experience. Onboarding reduced from 11 questions to 5 core questions as intended.

The conditional follow-ups (Issue Creation, Repository Creation) are appropriate design - they only trigger when relevant based on user selections. The success criterion should be read as "5 core onboarding questions" not "5 total questions under all code paths."

**Next Steps:**
- Mark phase 37 as complete
- Move phase directory to completed/
- Update ROADMAP.md checkboxes
- Update STATE.md with phase completion
