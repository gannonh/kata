import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  formatDoctorReport,
  runKataDoctor,
  summarizeDoctorIssues,
  filterDoctorIssues,
  selectDoctorScope,
} from "../doctor.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const tmpBase = mkdtempSync(join(tmpdir(), "kata-doctor-test-"));
const kata = join(tmpBase, ".kata");
const mDir = join(kata, "milestones", "M001");
const sDir = join(mDir, "slices", "S01");
const tDir = join(sDir, "tasks");
mkdirSync(tDir, { recursive: true });

writeFileSync(
  join(mDir, "M001-ROADMAP.md"),
  `# M001: Test Milestone

## Slices
- [ ] **S01: Demo Slice** \`risk:low\` \`depends:[]\`
  > After this: demo works
`,
);

writeFileSync(
  join(sDir, "S01-PLAN.md"),
  `# S01: Demo Slice

**Goal:** Demo
**Demo:** Demo

## Must-Haves
- done

## Tasks
- [x] **T01: Implement thing** \`est:10m\`
  Task is complete.
`,
);

writeFileSync(
  join(tDir, "T01-SUMMARY.md"),
  `---
id: T01
parent: S01
milestone: M001
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 10m
verification_result: passed
completed_at: 2026-03-09T00:00:00Z
---

# T01: Implement thing

**Done**

## What Happened
Implemented.

## Diagnostics
- log
`,
);

async function main(): Promise<void> {
  console.log("\n=== doctor diagnose ===");
  {
    const report = await runKataDoctor(tmpBase, { fix: false });
    assert(
      !report.ok,
      "report is not ok when completion artifacts are missing",
    );
    assert(
      report.issues.some(
        (issue) => issue.code === "all_tasks_done_missing_slice_summary",
      ),
      "detects missing slice summary",
    );
    assert(
      report.issues.some(
        (issue) => issue.code === "all_tasks_done_missing_slice_uat",
      ),
      "detects missing slice UAT",
    );
  }

  console.log("\n=== doctor formatting ===");
  {
    const report = await runKataDoctor(tmpBase, { fix: false });
    const summary = summarizeDoctorIssues(report.issues);
    assertEq(summary.errors, 2, "two blocking errors in summary");
    const scoped = filterDoctorIssues(report.issues, {
      scope: "M001/S01",
      includeWarnings: true,
    });
    assert(scoped.length >= 2, "scope filter keeps slice issues");
    const text = formatDoctorReport(report, {
      scope: "M001/S01",
      includeWarnings: true,
      maxIssues: 5,
    });
    assert(text.includes("Scope: M001/S01"), "formatted report shows scope");
    assert(
      text.includes("Top issue types:"),
      "formatted report shows grouped issue types",
    );
  }

  console.log("\n=== doctor default scope ===");
  {
    const scope = await selectDoctorScope(tmpBase);
    assertEq(
      scope,
      "M001/S01",
      "default doctor scope targets the active slice",
    );
  }

  console.log("\n=== doctor fix ===");
  {
    const report = await runKataDoctor(tmpBase, { fix: true });
    if (report.fixesApplied.length < 3) console.error(report);
    assert(report.fixesApplied.length >= 3, "applies multiple fixes");
    assert(
      existsSync(join(sDir, "S01-SUMMARY.md")),
      "creates placeholder slice summary",
    );
    assert(existsSync(join(sDir, "S01-UAT.md")), "creates placeholder UAT");

    const plan = readFileSync(join(sDir, "S01-PLAN.md"), "utf-8");
    assert(plan.includes("- [x] **T01:"), "marks task checkbox done");

    const roadmap = readFileSync(join(mDir, "M001-ROADMAP.md"), "utf-8");
    assert(roadmap.includes("- [x] **S01:"), "marks slice checkbox done");

    const state = readFileSync(join(kata, "STATE.md"), "utf-8");
    assert(state.includes("# Kata State"), "writes state file");
  }

  rmSync(tmpBase, { recursive: true, force: true });

  // ─── Milestone summary detection: missing summary ──────────────────────
  console.log("\n=== doctor detects missing milestone summary ===");
  {
    const msBase = mkdtempSync(join(tmpdir(), "kata-doctor-ms-test-"));
    const msGsd = join(msBase, ".kata");
    const msMDir = join(msGsd, "milestones", "M001");
    const msSDir = join(msMDir, "slices", "S01");
    const msTDir = join(msSDir, "tasks");
    mkdirSync(msTDir, { recursive: true });

    // Roadmap with ALL slices [x] — milestone is complete by slice status
    writeFileSync(
      join(msMDir, "M001-ROADMAP.md"),
      `# M001: Test Milestone

## Slices
- [x] **S01: Done Slice** \`risk:low\` \`depends:[]\`
  > After this: done
`,
    );

    // Slice has plan with all tasks done
    writeFileSync(
      join(msSDir, "S01-PLAN.md"),
      `# S01: Done Slice

**Goal:** Done
**Demo:** Done

## Tasks
- [x] **T01: Done Task** \`est:10m\`
  Done.
`,
    );

    // Task summary exists
    writeFileSync(
      join(msTDir, "T01-SUMMARY.md"),
      `---
id: T01
parent: S01
milestone: M001
---
# T01: Done
**Done**
## What Happened
Done.
`,
    );

    // Slice summary exists (so slice-level checks pass)
    writeFileSync(
      join(msSDir, "S01-SUMMARY.md"),
      `---
id: S01
parent: M001
---
# S01: Done
`,
    );

    // Slice UAT exists (so slice-level checks pass)
    writeFileSync(join(msSDir, "S01-UAT.md"), `# S01 UAT\nDone.\n`);

    // NO milestone summary — this is the condition we're detecting

    const report = await runKataDoctor(msBase, { fix: false });
    assert(
      report.issues.some(
        (issue) => issue.code === "all_slices_done_missing_milestone_summary",
      ),
      "detects missing milestone summary when all slices are done",
    );
    const msIssue = report.issues.find(
      (issue) => issue.code === "all_slices_done_missing_milestone_summary",
    );
    assertEq(
      msIssue?.scope,
      "milestone",
      "milestone summary issue has scope 'milestone'",
    );
    assertEq(
      msIssue?.severity,
      "warning",
      "milestone summary issue has severity 'warning'",
    );
    assertEq(
      msIssue?.unitId,
      "M001",
      "milestone summary issue unitId is 'M001'",
    );
    assert(
      msIssue?.message?.includes("SUMMARY") ?? false,
      "milestone summary issue message mentions SUMMARY",
    );

    rmSync(msBase, { recursive: true, force: true });
  }

  // ─── Milestone summary detection: summary present (no false positive) ──
  console.log("\n=== doctor does NOT flag milestone with summary ===");
  {
    const msBase = mkdtempSync(join(tmpdir(), "kata-doctor-ms-ok-test-"));
    const msGsd = join(msBase, ".kata");
    const msMDir = join(msGsd, "milestones", "M001");
    const msSDir = join(msMDir, "slices", "S01");
    const msTDir = join(msSDir, "tasks");
    mkdirSync(msTDir, { recursive: true });

    // Roadmap with ALL slices [x]
    writeFileSync(
      join(msMDir, "M001-ROADMAP.md"),
      `# M001: Test Milestone

## Slices
- [x] **S01: Done Slice** \`risk:low\` \`depends:[]\`
  > After this: done
`,
    );

    writeFileSync(
      join(msSDir, "S01-PLAN.md"),
      `# S01: Done Slice

**Goal:** Done
**Demo:** Done

## Tasks
- [x] **T01: Done Task** \`est:10m\`
  Done.
`,
    );

    writeFileSync(
      join(msTDir, "T01-SUMMARY.md"),
      `---
id: T01
parent: S01
milestone: M001
---
# T01: Done
**Done**
## What Happened
Done.
`,
    );

    writeFileSync(
      join(msSDir, "S01-SUMMARY.md"),
      `---
id: S01
parent: M001
---
# S01: Done
`,
    );

    writeFileSync(join(msSDir, "S01-UAT.md"), `# S01 UAT\nDone.\n`);

    // Milestone summary EXISTS
    writeFileSync(
      join(msMDir, "M001-SUMMARY.md"),
      `# M001 Summary\n\nMilestone complete.`,
    );

    const report = await runKataDoctor(msBase, { fix: false });
    assert(
      !report.issues.some(
        (issue) => issue.code === "all_slices_done_missing_milestone_summary",
      ),
      "does NOT report missing milestone summary when summary exists",
    );

    rmSync(msBase, { recursive: true, force: true });
  }

  // ─── blocker_discovered_no_replan detection ────────────────────────────
  console.log("\n=== doctor detects blocker_discovered_no_replan ===");
  {
    const bBase = mkdtempSync(join(tmpdir(), "kata-doctor-blocker-test-"));
    const bGsd = join(bBase, ".kata");
    const bMDir = join(bGsd, "milestones", "M001");
    const bSDir = join(bMDir, "slices", "S01");
    const bTDir = join(bSDir, "tasks");
    mkdirSync(bTDir, { recursive: true });

    writeFileSync(
      join(bMDir, "M001-ROADMAP.md"),
      `# M001: Test Milestone

## Slices
- [ ] **S01: Test Slice** \`risk:low\` \`depends:[]\`
  > After this: stuff works
`,
    );

    writeFileSync(
      join(bSDir, "S01-PLAN.md"),
      `# S01: Test Slice

**Goal:** Test
**Demo:** Test

## Tasks
- [x] **T01: First task** \`est:10m\`
  First task.

- [ ] **T02: Second task** \`est:10m\`
  Second task.
`,
    );

    // Task summary with blocker_discovered: true
    writeFileSync(
      join(bTDir, "T01-SUMMARY.md"),
      `---
id: T01
parent: S01
milestone: M001
provides: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
duration: 10m
verification_result: passed
completed_at: 2026-03-10T00:00:00Z
blocker_discovered: true
---

# T01: First task

**Found a blocker.**

## What Happened

Discovered an issue.
`,
    );

    // No REPLAN.md — should trigger the issue
    const report = await runKataDoctor(bBase, { fix: false });
    const blockerIssues = report.issues.filter(
      (i) => i.code === "blocker_discovered_no_replan",
    );
    assert(blockerIssues.length > 0, "detects blocker_discovered_no_replan");
    assertEq(
      blockerIssues[0]?.severity,
      "warning",
      "blocker issue has warning severity",
    );
    assertEq(blockerIssues[0]?.scope, "slice", "blocker issue has slice scope");
    assert(
      blockerIssues[0]?.message?.includes("T01") ?? false,
      "blocker issue message mentions T01",
    );
    assert(
      blockerIssues[0]?.message?.includes("S01") ?? false,
      "blocker issue message mentions S01",
    );

    rmSync(bBase, { recursive: true, force: true });
  }

  // ─── blocker_discovered with REPLAN.md (no false positive) ─────────────
  console.log("\n=== doctor does NOT flag blocker when REPLAN.md exists ===");
  {
    const bBase = mkdtempSync(join(tmpdir(), "kata-doctor-blocker-ok-test-"));
    const bGsd = join(bBase, ".kata");
    const bMDir = join(bGsd, "milestones", "M001");
    const bSDir = join(bMDir, "slices", "S01");
    const bTDir = join(bSDir, "tasks");
    mkdirSync(bTDir, { recursive: true });

    writeFileSync(
      join(bMDir, "M001-ROADMAP.md"),
      `# M001: Test Milestone

## Slices
- [ ] **S01: Test Slice** \`risk:low\` \`depends:[]\`
  > After this: stuff works
`,
    );

    writeFileSync(
      join(bSDir, "S01-PLAN.md"),
      `# S01: Test Slice

**Goal:** Test
**Demo:** Test

## Tasks
- [x] **T01: First task** \`est:10m\`
  First task.

- [ ] **T02: Second task** \`est:10m\`
  Second task.
`,
    );

    writeFileSync(
      join(bTDir, "T01-SUMMARY.md"),
      `---
id: T01
parent: S01
milestone: M001
blocker_discovered: true
completed_at: 2026-03-10T00:00:00Z
---

# T01: First task

**Found a blocker.**

## What Happened

Discovered an issue.
`,
    );

    // REPLAN.md exists — should NOT trigger
    writeFileSync(
      join(bSDir, "S01-REPLAN.md"),
      `# Replan\n\nAlready replanned.`,
    );

    const report = await runKataDoctor(bBase, { fix: false });
    const blockerIssues = report.issues.filter(
      (i) => i.code === "blocker_discovered_no_replan",
    );
    assertEq(
      blockerIssues.length,
      0,
      "no blocker_discovered_no_replan when REPLAN.md exists",
    );

    rmSync(bBase, { recursive: true, force: true });
  }

  // ─── Must-have verification: all addressed → no issue ─────────────────
  console.log(
    "\n=== doctor: done task with must-haves all addressed → no issue ===",
  );
  {
    const mhBase = mkdtempSync(join(tmpdir(), "kata-doctor-mh-ok-"));
    const mhGsd = join(mhBase, ".kata");
    const mhMDir = join(mhGsd, "milestones", "M001");
    const mhSDir = join(mhMDir, "slices", "S01");
    const mhTDir = join(mhSDir, "tasks");
    mkdirSync(mhTDir, { recursive: true });

    writeFileSync(
      join(mhMDir, "M001-ROADMAP.md"),
      `# M001: Test\n\n## Slices\n- [ ] **S01: Slice** \`risk:low\` \`depends:[]\`\n  > After this: done\n`,
    );
    writeFileSync(
      join(mhSDir, "S01-PLAN.md"),
      `# S01: Slice\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Tasks\n- [x] **T01: Implement** \`est:10m\`\n  Done.\n`,
    );

    // Task plan with must-haves
    writeFileSync(
      join(mhTDir, "T01-PLAN.md"),
      `# T01: Implement\n\n## Must-Haves\n\n- [ ] \`parseWidgets\` function exported\n- [ ] Unit tests pass with zero failures\n`,
    );

    // Summary mentioning both must-haves
    writeFileSync(
      join(mhTDir, "T01-SUMMARY.md"),
      `---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01: Implement\n\n## What Happened\nAdded parseWidgets function. Unit tests pass with zero failures.\n`,
    );

    const report = await runKataDoctor(mhBase, { fix: false });
    assert(
      !report.issues.some(
        (i) => i.code === "task_done_must_haves_not_verified",
      ),
      "no must-have issue when all must-haves are addressed",
    );

    rmSync(mhBase, { recursive: true, force: true });
  }

  // ─── Must-have verification: not addressed → warning fired ───────────
  console.log(
    "\n=== doctor: done task with must-haves NOT addressed → warning ===",
  );
  {
    const mhBase = mkdtempSync(join(tmpdir(), "kata-doctor-mh-fail-"));
    const mhGsd = join(mhBase, ".kata");
    const mhMDir = join(mhGsd, "milestones", "M001");
    const mhSDir = join(mhMDir, "slices", "S01");
    const mhTDir = join(mhSDir, "tasks");
    mkdirSync(mhTDir, { recursive: true });

    writeFileSync(
      join(mhMDir, "M001-ROADMAP.md"),
      `# M001: Test\n\n## Slices\n- [ ] **S01: Slice** \`risk:low\` \`depends:[]\`\n  > After this: done\n`,
    );
    writeFileSync(
      join(mhSDir, "S01-PLAN.md"),
      `# S01: Slice\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Tasks\n- [x] **T01: Implement** \`est:10m\`\n  Done.\n`,
    );

    // Task plan with 3 must-haves
    writeFileSync(
      join(mhTDir, "T01-PLAN.md"),
      `# T01: Implement\n\n## Must-Haves\n\n- [ ] \`parseWidgets\` function exported\n- [ ] \`countWidgets\` utility added\n- [ ] Full regression suite passes\n`,
    );

    // Summary mentions only parseWidgets — the other two are missing
    writeFileSync(
      join(mhTDir, "T01-SUMMARY.md"),
      `---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01: Implement\n\n## What Happened\nAdded parseWidgets function.\n`,
    );

    const report = await runKataDoctor(mhBase, { fix: false });
    const mhIssue = report.issues.find(
      (i) => i.code === "task_done_must_haves_not_verified",
    );
    assert(
      !!mhIssue,
      "must-have issue is fired when summary doesn't address all must-haves",
    );
    assertEq(
      mhIssue?.severity,
      "warning",
      "must-have issue is warning severity",
    );
    assertEq(mhIssue?.scope, "task", "must-have issue scope is task");
    assert(
      mhIssue?.message?.includes("3 must-haves") ?? false,
      "message mentions total must-have count",
    );
    assert(
      mhIssue?.message?.includes("only 1") ?? false,
      "message mentions addressed count",
    );
    assertEq(mhIssue?.fixable, false, "must-have issue is not fixable");

    rmSync(mhBase, { recursive: true, force: true });
  }

  // ─── Must-have verification: no task plan → no issue ─────────────────
  console.log("\n=== doctor: done task with no task plan file → no issue ===");
  {
    const mhBase = mkdtempSync(join(tmpdir(), "kata-doctor-mh-noplan-"));
    const mhGsd = join(mhBase, ".kata");
    const mhMDir = join(mhGsd, "milestones", "M001");
    const mhSDir = join(mhMDir, "slices", "S01");
    const mhTDir = join(mhSDir, "tasks");
    mkdirSync(mhTDir, { recursive: true });

    writeFileSync(
      join(mhMDir, "M001-ROADMAP.md"),
      `# M001: Test\n\n## Slices\n- [ ] **S01: Slice** \`risk:low\` \`depends:[]\`\n  > After this: done\n`,
    );
    writeFileSync(
      join(mhSDir, "S01-PLAN.md"),
      `# S01: Slice\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Tasks\n- [x] **T01: Implement** \`est:10m\`\n  Done.\n`,
    );

    // NO task plan file — just a summary
    writeFileSync(
      join(mhTDir, "T01-SUMMARY.md"),
      `---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01: Implement\n\n## What Happened\nDone.\n`,
    );

    const report = await runKataDoctor(mhBase, { fix: false });
    assert(
      !report.issues.some(
        (i) => i.code === "task_done_must_haves_not_verified",
      ),
      "no must-have issue when task plan file doesn't exist",
    );

    rmSync(mhBase, { recursive: true, force: true });
  }

  // ─── Must-have verification: plan exists but no Must-Haves section → no issue
  console.log(
    "\n=== doctor: done task with plan but no Must-Haves section → no issue ===",
  );
  {
    const mhBase = mkdtempSync(join(tmpdir(), "kata-doctor-mh-nosect-"));
    const mhGsd = join(mhBase, ".kata");
    const mhMDir = join(mhGsd, "milestones", "M001");
    const mhSDir = join(mhMDir, "slices", "S01");
    const mhTDir = join(mhSDir, "tasks");
    mkdirSync(mhTDir, { recursive: true });

    writeFileSync(
      join(mhMDir, "M001-ROADMAP.md"),
      `# M001: Test\n\n## Slices\n- [ ] **S01: Slice** \`risk:low\` \`depends:[]\`\n  > After this: done\n`,
    );
    writeFileSync(
      join(mhSDir, "S01-PLAN.md"),
      `# S01: Slice\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Tasks\n- [x] **T01: Implement** \`est:10m\`\n  Done.\n`,
    );

    // Task plan with NO Must-Haves section
    writeFileSync(
      join(mhTDir, "T01-PLAN.md"),
      `# T01: Implement\n\n## Steps\n\n1. Do the thing.\n\n## Verification\n\n- Run tests.\n`,
    );

    writeFileSync(
      join(mhTDir, "T01-SUMMARY.md"),
      `---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01: Implement\n\n## What Happened\nDone.\n`,
    );

    const report = await runKataDoctor(mhBase, { fix: false });
    assert(
      !report.issues.some(
        (i) => i.code === "task_done_must_haves_not_verified",
      ),
      "no must-have issue when task plan has no Must-Haves section",
    );

    rmSync(mhBase, { recursive: true, force: true });
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("All tests passed ✓");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
