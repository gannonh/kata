/**
 * Helpers for enabling PR lifecycle preferences in preferences.md frontmatter.
 *
 * Pure, deterministic transform used by guided-flow to avoid brittle regex edits.
 */

export interface EnablePrPreferencesTransformResult {
  content: string;
  changed: boolean;
  enabled: boolean;
}

const DEFAULT_PR_BLOCK = [
  "pr:",
  "  enabled: true",
  "  auto_create: false",
  "  base_branch: main",
  "  review_on_create: false",
  "  linear_link: false",
];

const FRONTMATTER_RE =
  /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)([\s\S]*)$/;

function findPrBlock(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => /^pr:\s*$/.test(line));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && /^[ \t]+/.test(lines[end])) end += 1;
  return { start, end };
}

function isPrEnabledTrue(lines: string[]): boolean {
  const block = findPrBlock(lines);
  if (!block) return false;

  for (let i = block.start + 1; i < block.end; i += 1) {
    const match = lines[i].match(/^([ \t]*enabled:\s*)([^#\s]+)(.*)$/i);
    if (!match) continue;
    return match[2].toLowerCase() === "true";
  }

  return false;
}

/**
 * Enables `pr.enabled: true` in YAML frontmatter content.
 * - If `pr:` exists, updates or inserts `enabled: true` inside that block.
 * - If `pr:` is absent, appends a default block before the closing `---`.
 * - If no YAML frontmatter is found, returns unchanged with enabled=false.
 */
export function enablePrPreferencesInContent(
  content: string,
): EnablePrPreferencesTransformResult {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { content, changed: false, enabled: false };
  }

  const [, open, body, close, rest] = match;
  const newline = open.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.length > 0 ? body.split(/\r?\n/) : [];
  const originalLines = [...lines];
  const prBlock = findPrBlock(lines);

  if (prBlock) {
    let enabledIndex = -1;
    for (let i = prBlock.start + 1; i < prBlock.end; i += 1) {
      if (/^[ \t]*enabled:\s*/i.test(lines[i])) {
        enabledIndex = i;
        break;
      }
    }

    if (enabledIndex >= 0) {
      lines[enabledIndex] = lines[enabledIndex].replace(
        /^([ \t]*enabled:\s*)([^#\s]+)(.*)$/i,
        "$1true$3",
      );
    } else {
      lines.splice(prBlock.start + 1, 0, "  enabled: true");
    }
  } else {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push(...DEFAULT_PR_BLOCK);
  }

  const nextBody = lines.join(newline);
  const nextContent = `${open}${nextBody}${close}${rest}`;
  const changed =
    nextContent !== content ||
    lines.length !== originalLines.length ||
    lines.some((line, index) => line !== originalLines[index]);

  return {
    content: nextContent,
    changed,
    enabled: isPrEnabledTrue(lines),
  };
}
