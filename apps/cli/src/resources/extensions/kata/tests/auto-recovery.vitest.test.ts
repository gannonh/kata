import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import {
  providerBackoffMs,
  skipExecuteTask,
  resolveExpectedArtifactPath,
  writeBlockerPlaceholder,
  diagnoseExpectedArtifact,
} from "../auto-recovery.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpBase: string;

function setupKataDir(): string {
  tmpBase = mkdtempSync(join(tmpdir(), "auto-recovery-test-"));
  return tmpBase;
}

/**
 * Create a minimal .kata directory structure with milestone and slice.
 * Returns the base path.
 */
function setupKataStructure(
  mid = "M001",
  sid = "S01",
  opts?: { withPlan?: string; withTasks?: boolean },
): string {
  const base = setupKataDir();
  const sliceDir = join(base, ".kata", "milestones", mid, "slices", sid);
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  if (opts?.withPlan) {
    writeFileSync(join(sliceDir, `${sid}-PLAN.md`), opts.withPlan, "utf-8");
  }
  return base;
}

// ─── providerBackoffMs ───────────────────────────────────────────────────────

describe("providerBackoffMs", () => {
  it("returns 5000 for attempt 0", () => {
    expect(providerBackoffMs(0)).toBe(5000);
  });

  it("returns 10000 for attempt 1", () => {
    expect(providerBackoffMs(1)).toBe(10_000);
  });

  it("returns 20000 for attempt 2", () => {
    expect(providerBackoffMs(2)).toBe(20_000);
  });

  it("returns 40000 for attempt 3", () => {
    expect(providerBackoffMs(3)).toBe(40_000);
  });

  it("caps at 60000 for attempt 4", () => {
    expect(providerBackoffMs(4)).toBe(60_000);
  });

  it("caps at 60000 for attempt 5", () => {
    expect(providerBackoffMs(5)).toBe(60_000);
  });

  it("caps at 60000 for attempt 6", () => {
    expect(providerBackoffMs(6)).toBe(60_000);
  });

  it("grows exponentially: 5s, 10s, 20s, 40s, 60s", () => {
    const values = [0, 1, 2, 3, 4, 5].map(providerBackoffMs);
    expect(values).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });
});

// ─── skipExecuteTask ─────────────────────────────────────────────────────────

describe("skipExecuteTask", () => {
  afterEach(() => {
    if (tmpBase) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("writes blocker summary when summaryExists is false", () => {
    const base = setupKataStructure("M001", "S01");
    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: false, taskChecked: true },
      "idle", 3,
    );
    expect(result).toBe(true);

    const summaryPath = join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md");
    expect(existsSync(summaryPath)).toBe(true);
    const content = readFileSync(summaryPath, "utf-8");
    expect(content).toContain("BLOCKER");
    expect(content).toContain("T01");
    expect(content).toContain("idle");
    expect(content).toContain("3 attempts");
  });

  it("marks [x] in plan when taskChecked is false", () => {
    const planContent = `# Plan\n\n- [ ] **T01: First task**\n- [ ] **T02: Second task**\n`;
    const base = setupKataStructure("M001", "S01", { withPlan: planContent });
    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: true, taskChecked: false },
      "crash", 5,
    );
    expect(result).toBe(true);

    const planPath = join(base, ".kata", "milestones", "M001", "slices", "S01", "S01-PLAN.md");
    const updated = readFileSync(planPath, "utf-8");
    expect(updated).toContain("- [x] **T01:");
    expect(updated).toContain("- [ ] **T02:");
  });

  it("writes both summary and plan checkbox when both missing", () => {
    const planContent = `# Plan\n\n- [ ] **T01: First task**\n`;
    const base = setupKataStructure("M001", "S01", { withPlan: planContent });
    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: false, taskChecked: false },
      "timeout", 2,
    );
    expect(result).toBe(true);

    const summaryPath = join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md");
    expect(existsSync(summaryPath)).toBe(true);

    const planPath = join(base, ".kata", "milestones", "M001", "slices", "S01", "S01-PLAN.md");
    const updated = readFileSync(planPath, "utf-8");
    expect(updated).toContain("- [x] **T01:");
  });

  it("does nothing when both summaryExists and taskChecked are true", () => {
    const planContent = `# Plan\n\n- [x] **T01: First task**\n`;
    const base = setupKataStructure("M001", "S01", { withPlan: planContent });
    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: true, taskChecked: true },
      "idle", 3,
    );
    expect(result).toBe(true);
    // No summary file should be written
    const summaryPath = join(base, ".kata", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md");
    expect(existsSync(summaryPath)).toBe(false);
  });

  it("returns false when target dir cannot be resolved", () => {
    // base with no .kata structure at all
    const base = mkdtempSync(join(tmpdir(), "auto-recovery-empty-"));
    tmpBase = base;
    const result = skipExecuteTask(
      base, "M099", "S99", "T01",
      { summaryExists: false, taskChecked: true },
      "idle", 3,
    );
    expect(result).toBe(false);
  });

  it("skips plan checkbox when plan file does not exist", () => {
    const base = setupKataStructure("M001", "S01");
    // No plan file created
    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: true, taskChecked: false },
      "idle", 3,
    );
    // Should still return true — plan update is best-effort
    expect(result).toBe(true);
  });

  it("skips plan checkbox when regex doesn't match", () => {
    const planContent = `# Plan\n\n- [ ] **T02: Only T02 here**\n`;
    const base = setupKataStructure("M001", "S01", { withPlan: planContent });
    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: true, taskChecked: false },
      "idle", 3,
    );
    expect(result).toBe(true);
    // Plan should not be modified since T01 doesn't match
    const planPath = join(base, ".kata", "milestones", "M001", "slices", "S01", "S01-PLAN.md");
    const content = readFileSync(planPath, "utf-8");
    expect(content).toBe(planContent);
  });

  it("creates tasks dir if it doesn't exist", () => {
    const base = setupKataDir();
    // Create slice dir but NOT tasks subdir
    const sliceDir = join(base, ".kata", "milestones", "M001", "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });

    const result = skipExecuteTask(
      base, "M001", "S01", "T01",
      { summaryExists: false, taskChecked: true },
      "idle", 3,
    );
    expect(result).toBe(true);

    const summaryPath = join(sliceDir, "tasks", "T01-SUMMARY.md");
    expect(existsSync(summaryPath)).toBe(true);
  });
});

// ─── resolveExpectedArtifactPath ─────────────────────────────────────────────

describe("resolveExpectedArtifactPath", () => {
  afterEach(() => {
    if (tmpBase) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("returns RESEARCH path for research-milestone", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("research-milestone", "M001", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("M001-RESEARCH.md");
  });

  it("returns ROADMAP path for plan-milestone", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("plan-milestone", "M001", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("M001-ROADMAP.md");
  });

  it("returns RESEARCH path for research-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("research-slice", "M001/S01", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("S01-RESEARCH.md");
  });

  it("returns PLAN path for plan-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("plan-slice", "M001/S01", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("S01-PLAN.md");
  });

  it("returns ASSESSMENT path for reassess-roadmap", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("reassess-roadmap", "M001/S01", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("S01-ASSESSMENT.md");
  });

  it("returns UAT-RESULT path for run-uat", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("run-uat", "M001/S01", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("S01-UAT-RESULT.md");
  });

  it("returns SUMMARY path for complete-milestone", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("complete-milestone", "M001", base);
    expect(result).not.toBeNull();
    expect(result!).toContain("M001-SUMMARY.md");
  });

  it("returns null for execute-task", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("execute-task", "M001/S01/T01", base);
    expect(result).toBeNull();
  });

  it("returns null for complete-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("complete-slice", "M001/S01", base);
    expect(result).toBeNull();
  });

  it("returns null for replan-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("replan-slice", "M001/S01", base);
    expect(result).toBeNull();
  });

  it("returns null for unknown unit type", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("unknown-type", "M001/S01", base);
    expect(result).toBeNull();
  });

  it("returns null when milestone dir does not exist", () => {
    const base = mkdtempSync(join(tmpdir(), "auto-recovery-nodir-"));
    tmpBase = base;
    const result = resolveExpectedArtifactPath("research-milestone", "M099", base);
    expect(result).toBeNull();
  });

  it("returns null when slice dir does not exist for slice-level type", () => {
    const base = setupKataStructure("M001", "S01");
    const result = resolveExpectedArtifactPath("research-slice", "M001/S99", base);
    expect(result).toBeNull();
  });
});

// ─── writeBlockerPlaceholder ─────────────────────────────────────────────────

describe("writeBlockerPlaceholder", () => {
  afterEach(() => {
    if (tmpBase) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("writes a placeholder file and returns diagnostic string", () => {
    const base = setupKataStructure("M001", "S01");
    const result = writeBlockerPlaceholder(
      "research-milestone", "M001", base, "idle timeout",
    );
    expect(result).not.toBeNull();
    expect(result).toContain("M001-RESEARCH.md");

    const filePath = join(base, ".kata", "milestones", "M001", "M001-RESEARCH.md");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("BLOCKER");
    expect(content).toContain("idle timeout");
    expect(content).toContain("research-milestone");
  });

  it("returns null for unit types that don't produce artifacts", () => {
    const base = setupKataStructure("M001", "S01");
    const result = writeBlockerPlaceholder(
      "execute-task", "M001/S01/T01", base, "crash",
    );
    expect(result).toBeNull();
  });

  it("writes placeholder for slice-level types", () => {
    const base = setupKataStructure("M001", "S01");
    const result = writeBlockerPlaceholder(
      "plan-slice", "M001/S01", base, "network error",
    );
    expect(result).not.toBeNull();
    const filePath = join(base, ".kata", "milestones", "M001", "slices", "S01", "S01-PLAN.md");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("BLOCKER");
    expect(content).toContain("network error");
  });

  it("returns null when path cannot be resolved", () => {
    const base = mkdtempSync(join(tmpdir(), "auto-recovery-nodir2-"));
    tmpBase = base;
    const result = writeBlockerPlaceholder(
      "research-milestone", "M099", base, "unknown",
    );
    expect(result).toBeNull();
  });
});

// ─── diagnoseExpectedArtifact ────────────────────────────────────────────────

describe("diagnoseExpectedArtifact", () => {
  afterEach(() => {
    if (tmpBase) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it("returns description for research-milestone", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("research-milestone", "M001", base);
    expect(result).toContain("milestone research");
  });

  it("returns description for plan-milestone", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("plan-milestone", "M001", base);
    expect(result).toContain("milestone roadmap");
  });

  it("returns description for research-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("research-slice", "M001/S01", base);
    expect(result).toContain("slice research");
  });

  it("returns description for plan-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("plan-slice", "M001/S01", base);
    expect(result).toContain("slice plan");
  });

  it("returns description for execute-task", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("execute-task", "M001/S01/T01", base);
    expect(result).toContain("T01");
    expect(result).toContain("summary written");
  });

  it("returns description for complete-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("complete-slice", "M001/S01", base);
    expect(result).toContain("S01");
    expect(result).toContain("summary written");
  });

  it("returns description for replan-slice", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("replan-slice", "M001/S01", base);
    expect(result).toContain("REPLAN");
  });

  it("returns description for reassess-roadmap", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("reassess-roadmap", "M001/S01", base);
    expect(result).toContain("roadmap reassessment");
  });

  it("returns description for run-uat", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("run-uat", "M001/S01", base);
    expect(result).toContain("UAT result");
  });

  it("returns description for complete-milestone", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("complete-milestone", "M001", base);
    expect(result).toContain("milestone summary");
  });

  it("returns null for unknown unit type", () => {
    const base = setupKataStructure("M001", "S01");
    const result = diagnoseExpectedArtifact("unknown-xyz", "M001/S01", base);
    expect(result).toBeNull();
  });
});
