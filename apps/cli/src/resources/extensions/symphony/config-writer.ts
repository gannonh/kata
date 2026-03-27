import { readFileSync, writeFileSync } from "node:fs";
import { dump } from "js-yaml";
import type { ConfigEditorModel } from "./config-model.js";
import {
  applyModelToConfig,
  extractWorkflowSegments,
  parseWorkflowConfig,
} from "./config-parser.js";

export interface WorkflowWriteResult {
  content: string;
  updatedFrontmatter: string;
}

export function renderUpdatedWorkflowContent(
  existingContent: string,
  model: ConfigEditorModel,
): WorkflowWriteResult {
  const segments = extractWorkflowSegments(existingContent);
  const baseline = parseWorkflowConfig(existingContent);
  const updatedConfig = applyModelToConfig(model, baseline.workflow.config);
  const updatedFrontmatter = patchFrontmatterWithConfig(
    segments.frontmatter,
    model,
    updatedConfig,
  );

  const content = replaceWorkflowFrontmatter(existingContent, updatedFrontmatter);
  return { content, updatedFrontmatter };
}

export function writeWorkflowConfigFile(
  workflowPath: string,
  model: ConfigEditorModel,
): WorkflowWriteResult {
  const existing = readFileSync(workflowPath, "utf-8");
  const result = renderUpdatedWorkflowContent(existing, model);
  writeFileSync(workflowPath, result.content, "utf-8");
  return result;
}

export function replaceWorkflowFrontmatter(
  content: string,
  frontmatter: string,
): string {
  const segments = extractWorkflowSegments(content);
  const normalizedFrontmatter = frontmatter.endsWith("\n")
    ? frontmatter.slice(0, -1)
    : frontmatter;

  return `---\n${normalizedFrontmatter}\n---${segments.body.length > 0 ? `\n${segments.body}` : "\n"}`;
}

export function patchFrontmatterWithConfig(
  frontmatter: string,
  model: ConfigEditorModel,
  config: Record<string, unknown>,
): string {
  const lines = frontmatter.split(/\r?\n/);
  const paths = Array.from(
    new Set(
      model.sections.flatMap((section) =>
        section.fields.map((field) => field.path.join(".")),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));

  for (const path of paths) {
    const value = readPath(config, path.split("."));
    patchYamlPath(lines, path.split("."), value);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function patchYamlPath(lines: string[], path: string[], value: unknown): void {
  let rangeStart = 0;
  let rangeEnd = lines.length;
  let parentIndent = -2;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const indent = parentIndent + 2;
    let keyLine = findKeyLine(lines, rangeStart, rangeEnd, indent, segment);

    if (keyLine === -1) {
      keyLine = rangeEnd;
      lines.splice(keyLine, 0, `${spaces(indent)}${segment}:`);
      rangeEnd += 1;
    }

    const blockEnd = findBlockEnd(lines, keyLine, indent, rangeEnd);
    rangeStart = keyLine + 1;
    rangeEnd = blockEnd;
    parentIndent = indent;
  }

  const key = path[path.length - 1];
  const indent = parentIndent + 2;
  const keyLine = findKeyLine(lines, rangeStart, rangeEnd, indent, key);

  if (value === undefined) {
    if (keyLine >= 0) {
      const blockEnd = findBlockEnd(lines, keyLine, indent, rangeEnd);
      lines.splice(keyLine, blockEnd - keyLine);
    }
    return;
  }

  let replacement = buildYamlBlock(key, indent, value);

  if (keyLine >= 0) {
    const blockEnd = findBlockEnd(lines, keyLine, indent, rangeEnd);
    if (replacement.length === 1) {
      const inlineComment = extractInlineComment(lines[keyLine]);
      if (inlineComment) {
        replacement = [`${replacement[0]} ${inlineComment}`];
      }
    }
    lines.splice(keyLine, blockEnd - keyLine, ...replacement);
    return;
  }

  lines.splice(rangeEnd, 0, ...replacement);
}

function buildYamlBlock(key: string, indent: number, value: unknown): string[] {
  const keyPrefix = `${spaces(indent)}${key}:`;

  if (Array.isArray(value)) {
    const items = value.map((entry) => `${spaces(indent + 2)}- ${serializeScalar(entry)}`);
    return items.length > 0 ? [keyPrefix, ...items] : [`${keyPrefix} []`];
  }

  return [`${keyPrefix} ${serializeScalar(value)}`];
}

function serializeScalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) return "null";
  if (value === undefined) return "''";

  const serialized = dump(value, {
    lineWidth: -1,
    noRefs: true,
  }).trim();

  return serialized.includes("\n") ? JSON.stringify(String(value)) : serialized;
}

function findKeyLine(
  lines: string[],
  start: number,
  end: number,
  indent: number,
  key: string,
): number {
  const escaped = escapeRegExp(key);
  const matcher = new RegExp(`^\\s{${indent}}${escaped}:(?:\\s|$)`);

  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (matcher.test(line)) return index;
  }

  return -1;
}

function findBlockEnd(
  lines: string[],
  startIndex: number,
  indent: number,
  hardEnd: number,
): number {
  for (let index = startIndex + 1; index < hardEnd; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
    if (lineIndent <= indent) {
      return index;
    }
  }

  return hardEnd;
}

function spaces(length: number): string {
  return " ".repeat(Math.max(length, 0));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readPath(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function extractInlineComment(line: string): string | null {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && char === "#") {
      const previous = index > 0 ? line[index - 1] : "";
      if (index === 0 || /\s/.test(previous)) {
        return line.slice(index);
      }
    }
  }

  return null;
}
