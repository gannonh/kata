import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// loadPrompt reads from ~/.kata-cli/agent/extensions/kata/prompts/ (main checkout).
// In a worktree the file may not exist there yet, so we resolve prompts
// relative to this test file's location (the worktree copy).
const __dirname = dirname(fileURLToPath(import.meta.url));
const worktreePromptsDir = join(__dirname, "..", "prompts");

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

/**
 * Load a prompt template from the worktree prompts directory
 * and apply variable substitution (mirrors loadPrompt logic).
 */
function loadPromptFromWorktree(
  name: string,
  vars: Record<string, string> = {},
): string {
  const path = join(worktreePromptsDir, `${name}.md`);
  let content = readFileSync(path, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // ─── reassess-roadmap prompt loads and substitutes ─────────────────────
  console.log("\n=== reassess-roadmap prompt loads and substitutes ===");
  {
    const testVars = {
      milestoneId: "M099",
      completedSliceId: "S03",
      inlinedContext: "--- test inlined context block ---",
      backendRules: "",
      backendOps: ".kata/milestones/M099/slices/S03/S03-ASSESSMENT.md",
      backendMustComplete: ".kata/milestones/M099/M099-ROADMAP.md",
    };

    let result: string;
    let threw = false;
    try {
      result = loadPromptFromWorktree("reassess-roadmap", testVars);
    } catch (err) {
      threw = true;
      result = "";
      console.error(`  ERROR: loadPrompt threw: ${err}`);
    }

    assert(!threw, "loadPrompt does not throw for reassess-roadmap");
    assert(
      typeof result === "string" && result.length > 0,
      "loadPrompt returns a non-empty string",
    );

    // Verify all test variables were substituted into the output
    assert(result.includes("M099"), "prompt contains milestoneId 'M099'");
    assert(result.includes("S03"), "prompt contains completedSliceId 'S03'");
    assert(
      result.includes(".kata/milestones/M099/slices/S03/S03-ASSESSMENT.md"),
      "prompt contains assessment path via backendOps",
    );
    assert(
      result.includes(".kata/milestones/M099/M099-ROADMAP.md"),
      "prompt contains roadmap path via backendMustComplete",
    );
    assert(
      result.includes("--- test inlined context block ---"),
      "prompt contains inlinedContext",
    );

    // Verify no un-substituted variables remain
    assert(
      !result.includes("{{milestoneId}}"),
      "no un-substituted {{milestoneId}}",
    );
    assert(
      !result.includes("{{completedSliceId}}"),
      "no un-substituted {{completedSliceId}}",
    );
    assert(
      !result.includes("{{backendOps}}"),
      "no un-substituted {{backendOps}}",
    );
    assert(
      !result.includes("{{backendMustComplete}}"),
      "no un-substituted {{backendMustComplete}}",
    );
    assert(
      !result.includes("{{inlinedContext}}"),
      "no un-substituted {{inlinedContext}}",
    );
  }

  // ─── reassess-roadmap contains coverage-check instruction ─────────────
  console.log("\n=== reassess-roadmap contains coverage-check instruction ===");
  {
    const prompt = loadPromptFromWorktree("reassess-roadmap", {
      milestoneId: "M001",
      completedSliceId: "S01",
      inlinedContext: "context",
      backendRules: "",
      backendOps: "",
      backendMustComplete: "",
    });

    // Normalize to lowercase for case-insensitive matching
    const lower = prompt.toLowerCase();

    // The prompt must mention "each success criterion" or "every success criterion"
    assert(
      lower.includes("each success criterion") ||
        lower.includes("every success criterion"),
      "prompt contains 'each success criterion' or 'every success criterion'",
    );

    // The prompt must mention "owning slice" or "remaining slice"
    assert(
      lower.includes("owning slice") || lower.includes("remaining slice"),
      "prompt contains 'owning slice' or 'remaining slice'",
    );

    // The prompt must mention "no remaining owner" or "no owner" or "no slice"
    assert(
      lower.includes("no remaining owner") ||
        lower.includes("no owner") ||
        lower.includes("no slice"),
      "prompt contains 'no remaining owner', 'no owner', or 'no slice'",
    );

    // The prompt must mention "blocking issue" or "blocking"
    assert(
      lower.includes("blocking issue") || lower.includes("blocking"),
      "prompt contains 'blocking issue' or 'blocking'",
    );
  }

  // ─── coverage-check requires at-least-one semantics ───────────────────
  console.log("\n=== coverage-check requires at-least-one semantics ===");
  {
    const prompt = loadPromptFromWorktree("reassess-roadmap", {
      milestoneId: "M001",
      completedSliceId: "S01",
      inlinedContext: "context",
      backendRules: "",
      backendOps: "",
      backendMustComplete: "",
    });

    const lower = prompt.toLowerCase();

    // The instruction must use "at least one" or equivalent inclusive language
    assert(
      lower.includes("at least one") ||
        lower.includes("at-least-one") ||
        lower.includes("one or more"),
      "prompt uses 'at least one' or equivalent inclusive language for slice ownership",
    );

    // The instruction must NOT require "exactly one" — that would be too rigid
    assert(
      !lower.includes("exactly one owner") &&
        !lower.includes("exactly one slice"),
      "prompt does NOT use 'exactly one' for slice ownership (would be too rigid)",
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Results
  // ═════════════════════════════════════════════════════════════════════════

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
