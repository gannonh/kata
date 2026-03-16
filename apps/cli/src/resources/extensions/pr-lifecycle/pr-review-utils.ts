/**
 * pr-review-utils.ts — Core logic for PR review scoping, prompt building, and
 * finding aggregation.
 *
 * All public functions are pure or return null on failure — they never throw.
 * Called by the `kata_review_pr` tool (T04) and tested independently.
 */

import { execSync } from "node:child_process";

const PIPE = { stdio: ["pipe", "pipe", "pipe"] as [string, string, string] };

// ---------------------------------------------------------------------------
// PrContext interface
// ---------------------------------------------------------------------------

export interface PrContext {
  prNumber: number;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  diff: string;
  changedFiles: string[]; // basenames or relative paths from diff --stat
}

// ---------------------------------------------------------------------------
// fetchPRContext
// ---------------------------------------------------------------------------

/**
 * Fetches PR metadata and diff for the open PR on the current branch.
 * Returns null on any failure (not on PR branch, gh error, no open PR, etc.).
 * Never throws.
 */
export function fetchPRContext(cwd: string): PrContext | null {
  try {
    const prJsonRaw = execSync(
      "gh pr view --json number,title,body,headRefName,baseRefName",
      { cwd, encoding: "utf8", ...PIPE },
    );

    const prJson = JSON.parse(prJsonRaw) as {
      number: number;
      title: string;
      body: string;
      headRefName: string;
      baseRefName: string;
    };

    const diff = execSync("gh pr diff", {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });

    // Parse changed file paths via --name-only
    const nameOnlyOutput = execSync("gh pr diff --name-only", {
      cwd,
      encoding: "utf8",
      ...PIPE,
    });

    const changedFiles: string[] = nameOnlyOutput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    return {
      prNumber: prJson.number,
      title: prJson.title,
      body: prJson.body ?? "",
      headBranch: prJson.headRefName,
      baseBranch: prJson.baseRefName,
      diff,
      changedFiles,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// scopeReviewers
// ---------------------------------------------------------------------------

/**
 * Determines which reviewers to dispatch for a given PR diff and changed file list.
 *
 * - Always includes `pr-code-reviewer` (baseline, never skipped).
 * - Applies heuristics to include up to 5 additional specialist reviewers.
 * - Returns a deduplicated, ordered array (code-reviewer first, others in
 *   declaration order).
 */
export function scopeReviewers({
  diff,
  changedFiles,
}: {
  diff: string;
  changedFiles: string[];
}): string[] {
  const reviewers: string[] = ["pr-code-reviewer"];

  // Error/async handling patterns
  if (/try\s*\{|catch\s*\(|async\s+|\.catch\(/.test(diff)) {
    reviewers.push("pr-failure-finder");
  }

  // Test files present or test framework constructs in diff
  if (
    changedFiles.some((f) => /\.test\.|\.spec\./.test(f)) ||
    /describe\(|it\(|test\(/.test(diff)
  ) {
    reviewers.push("pr-test-analyzer");
  }

  // Large diff
  if (diff.split("\n").length > 100) {
    reviewers.push("pr-code-simplifier");
  }

  // TypeScript interface or type declarations
  if (/^[+-].*\binterface\s|^[+-].*\btype\s+[A-Z]/m.test(diff)) {
    reviewers.push("pr-type-design-analyzer");
  }

  // JSDoc or inline comments
  if (/^[+-].*\/\*\*|^[+-].*\/\//m.test(diff)) {
    reviewers.push("pr-comment-analyzer");
  }

  // Deduplicate (preserve order)
  return [...new Set(reviewers)];
}

// ---------------------------------------------------------------------------
// buildReviewerTaskPrompt
// ---------------------------------------------------------------------------

/**
 * Maximum characters of diff to embed directly in a reviewer prompt.
 * ~100K tokens — leaves headroom for system prompt, tools, and instructions.
 * Beyond this, the prompt tells reviewers to use tools (bash/read) for the rest.
 */
export const MAX_DIFF_CHARS = 400_000;

/**
 * Builds a self-contained task prompt for a specific reviewer subagent.
 * Embeds PR number, title, diff, and reviewer-specific instructions.
 *
 * When the diff exceeds `maxDiffChars`, the embedded diff is truncated and
 * the reviewer is instructed to use `bash("gh pr diff")` or `read` to
 * inspect the remaining changes.
 */
export function buildReviewerTaskPrompt({
  reviewer,
  prTitle,
  prNumber,
  diff,
  changedFiles,
  prBody,
  reviewerInstructions,
  maxDiffChars = MAX_DIFF_CHARS,
}: {
  reviewer: string;
  prTitle: string;
  prNumber: number;
  diff: string;
  changedFiles: string[];
  prBody?: string;
  reviewerInstructions?: string;
  maxDiffChars?: number;
}): string {
  const body = prBody && prBody.trim() ? prBody : "(no description)";
  const filesSection =
    changedFiles.length > 0 ? changedFiles.join("\n") : "(none listed)";
  const instructions =
    reviewerInstructions ??
    `You are the ${reviewer}. Review the PR changes carefully and report any issues you find.`;

  const isTruncated = diff.length > maxDiffChars;

  let diffSection: string;
  if (isTruncated) {
    // Truncate at a newline boundary to avoid cutting mid-line
    let cutoff = maxDiffChars;
    const newlineIdx = diff.lastIndexOf("\n", cutoff);
    if (newlineIdx > maxDiffChars * 0.8) cutoff = newlineIdx;

    const truncatedDiff = diff.slice(0, cutoff);
    const totalLines = diff.split("\n").length;
    const shownLines = truncatedDiff.split("\n").length;
    const remainingChars = diff.length - cutoff;

    diffSection = `Diff (showing first ~${shownLines.toLocaleString()} of ${totalLines.toLocaleString()} lines — truncated, ${remainingChars.toLocaleString()} chars remaining):
${truncatedDiff}

... [DIFF TRUNCATED — ${remainingChars.toLocaleString()} more characters not shown]

IMPORTANT: This diff was too large to include in full. You MUST use tools to review the remaining changes:
- bash("gh pr diff -- path/to/file.ts") — get the diff for a specific file
- bash("gh pr diff | head -n 5000")     — get more lines from the full diff
- read("path/to/file.ts")              — read the current version of any changed file
Review ALL changed files listed above, not just what's shown in the truncated diff.`;
  } else {
    diffSection = `Full diff:
${diff}`;
  }

  return `You are reviewing PR #${prNumber}: "${prTitle}"

PR Description:
${body}

Changed files:
${filesSection}

${diffSection}

Review instructions:
${instructions}

Focus your review on the PR diff. Flag only issues in changed code unless existing code creates a clear bug when combined with the changes.
Report findings in this format: group by severity (Critical, Important, Suggestions). For each issue include: file path + line number in bold (**file:line**), description, and a concrete fix suggestion.`;
}

// ---------------------------------------------------------------------------
// aggregateFindings
// ---------------------------------------------------------------------------

/**
 * Aggregates and deduplicates findings from multiple reviewer outputs.
 *
 * - Parses severity sections (Critical / Important / Suggestions) from each output.
 * - Deduplicates by `file:line` fingerprint — keeps only the first occurrence.
 * - Falls back to `## Raw Findings` section when no structured findings are found.
 */
export function aggregateFindings(findings: string[]): string {
  const critical: string[] = [];
  const important: string[] = [];
  const suggestions: string[] = [];
  const seenFingerprints = new Set<string>();

  /** Extract `file:line` fingerprints from **file:line** patterns. */
  function extractFingerprints(text: string): string[] {
    const matches = text.match(/\*\*(\S+:\d+)\*\*/g) ?? [];
    return matches.map((m) => m.replace(/\*\*/g, ""));
  }

  /** Returns true when all fingerprints in the text have already been seen. */
  function isDuplicate(text: string): boolean {
    const fps = extractFingerprints(text);
    if (fps.length === 0) return false;
    return fps.every((fp) => seenFingerprints.has(fp));
  }

  /** Records all fingerprints from the text as seen. */
  function markFingerprints(text: string): void {
    extractFingerprints(text).forEach((fp) => seenFingerprints.add(fp));
  }

  for (const finding of findings) {
    const lines = finding.split("\n");
    let currentSeverity: "critical" | "important" | "suggestion" | null = null;
    const buffer: string[] = [];

    const flushBuffer = (): void => {
      if (buffer.length === 0) return;
      const text = buffer.join("\n").trim();
      if (!text) {
        buffer.length = 0;
        return;
      }
      if (!isDuplicate(text)) {
        markFingerprints(text);
        if (currentSeverity === "critical") critical.push(text);
        else if (currentSeverity === "important") important.push(text);
        else if (currentSeverity === "suggestion") suggestions.push(text);
      }
      buffer.length = 0;
    };

    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim();

      if (
        /^#{1,3}\s*🔴\s*critical/i.test(lowerLine) ||
        /^#{1,3}\s*critical/i.test(lowerLine) ||
        /^\*\*critical\*\*/i.test(lowerLine) ||
        lowerLine.startsWith("critical:")
      ) {
        flushBuffer();
        currentSeverity = "critical";
        const content = line.replace(/^.*?critical[:\s]*/i, "").trim();
        if (content) buffer.push(content);
      } else if (
        /^#{1,3}\s*🟡\s*important/i.test(lowerLine) ||
        /^#{1,3}\s*important/i.test(lowerLine) ||
        /^\*\*important\*\*/i.test(lowerLine) ||
        lowerLine.startsWith("important:")
      ) {
        flushBuffer();
        currentSeverity = "important";
        const content = line.replace(/^.*?important[:\s]*/i, "").trim();
        if (content) buffer.push(content);
      } else if (
        /^#{1,3}\s*💡\s*suggestions?/i.test(lowerLine) ||
        /^#{1,3}\s*suggestions?/i.test(lowerLine) ||
        /^\*\*suggestions?\*\*/i.test(lowerLine) ||
        lowerLine.startsWith("suggestion:") ||
        lowerLine.startsWith("suggestions:")
      ) {
        flushBuffer();
        currentSeverity = "suggestion";
        const content = line
          .replace(/^.*?suggestions?[:\s]*/i, "")
          .trim();
        if (content) buffer.push(content);
      } else if (currentSeverity !== null) {
        buffer.push(line);
      } else if (/\*\*\S+:\d+\*\*/.test(line)) {
        // Fallback: bare file:line reference with no severity context → Suggestions
        const text = line.trim();
        if (text && !isDuplicate(text)) {
          markFingerprints(text);
          suggestions.push(text);
        }
      }
    }
    flushBuffer();
  }

  const hasFindings =
    critical.length > 0 || important.length > 0 || suggestions.length > 0;

  const criticalSection =
    critical.length > 0 ? critical.join("\n\n") : "(none)";
  const importantSection =
    important.length > 0 ? important.join("\n\n") : "(none)";
  const suggestionsSection =
    suggestions.length > 0 ? suggestions.join("\n\n") : "(none)";

  let output = `## PR Review Findings

## 🔴 Critical
${criticalSection}

## 🟡 Important
${importantSection}

## 💡 Suggestions
${suggestionsSection}`;

  if (!hasFindings && findings.length > 0) {
    output += "\n\n## Raw Findings\n";
    findings.forEach((f, i) => {
      output += `\n### Reviewer ${i + 1}\n${f}\n`;
    });
  }

  return output;
}
