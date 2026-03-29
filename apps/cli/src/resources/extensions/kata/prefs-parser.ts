/**
 * Preferences file parser.
 *
 * Extracts YAML frontmatter from `.kata/preferences.md`, parses it with
 * js-yaml, and builds a `ConfigEditorModel` via `buildPreferencesModel`.
 */

import { load, type YAMLException } from "js-yaml";
import type { ConfigEditorModel, WorkflowFrontmatter } from "../symphony/config-model.js";
import { buildPreferencesModel } from "./prefs-model.js";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PreferencesParseError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(message);
    this.name = "PreferencesParseError";
    this.line = line;
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface ParsedPreferencesFile {
  model: ConfigEditorModel;
  body: string;
}

/**
 * Parse a `preferences.md` file content into a `ConfigEditorModel` and body.
 *
 * Extracts `---` delimited YAML frontmatter, parses it, builds the field
 * model, and returns both the model and the markdown body below the
 * closing `---`.
 *
 * Edge cases handled:
 * - BOM prefix (stripped)
 * - CRLF line endings (preserved in body, normalized for YAML parsing)
 * - Empty frontmatter (`---\n---`) → empty config
 * - Missing frontmatter → error
 */
export function parsePreferencesFile(content: string): ParsedPreferencesFile {
  // Strip BOM
  const stripped = content.startsWith("\uFEFF") ? content.slice(1) : content;

  // Match frontmatter: must start with --- on the first line
  const match = stripped.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );

  if (!match) {
    throw new PreferencesParseError(
      "preferences.md must begin with YAML frontmatter delimited by ---",
    );
  }

  const rawFrontmatter = match[1];
  const body = stripped.slice(match[0].length);

  const config = parseYamlConfig(rawFrontmatter);

  const model = buildPreferencesModel(config);

  // Populate the workflow field with raw frontmatter and body
  const workflow: WorkflowFrontmatter = {
    config,
    raw: rawFrontmatter,
    body,
  };
  model.workflow = workflow;

  return { model, body };
}

function parseYamlConfig(frontmatter: string): Record<string, unknown> {
  // Empty frontmatter
  const trimmed = frontmatter.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = load(frontmatter) ?? {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new PreferencesParseError(
      "YAML frontmatter must parse to an object at the top level",
    );
  } catch (error) {
    if (error instanceof PreferencesParseError) {
      throw error;
    }

    const yamlError = error as YAMLException & {
      mark?: { line?: number };
      message?: string;
    };

    const line =
      typeof yamlError.mark?.line === "number"
        ? yamlError.mark.line + 1
        : undefined;
    const message = yamlError.message ?? "Failed to parse YAML frontmatter";

    throw new PreferencesParseError(message, line);
  }
}
