/**
 * Preferences file writer.
 *
 * Serializes a `ConfigEditorModel` back to YAML frontmatter + markdown body.
 * Pairs with `prefs-parser.ts` for round-trip preservation.
 */

import { dump } from "js-yaml";
import { cloneConfig, type ConfigEditorModel, type ConfigField } from "../symphony/config-model.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function setPath(
  root: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  if (path.length === 0) return;

  let current: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}

function deletePath(root: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) return;

  const trail: Array<{ node: Record<string, unknown>; key: string }> = [];
  let current: Record<string, unknown> = root;

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
    trail.push({ node: current, key: segment });
    current = next as Record<string, unknown>;
  }

  delete current[path[path.length - 1]];

  // Clean up empty parent objects
  for (let i = trail.length - 1; i >= 0; i--) {
    const { node, key } = trail[i];
    const candidate = node[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.keys(candidate as Record<string, unknown>).length === 0
    ) {
      delete node[key];
      continue;
    }
    break;
  }
}

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

function normalizeFieldValueForWrite(field: ConfigField): unknown {
  if (field.type === "string" || field.type === "enum") {
    const text = typeof field.value === "string" ? field.value.trim() : "";
    if (!text && !field.required) return undefined;
    return text;
  }

  if (field.type === "number") {
    if (field.value === null || field.value === undefined || field.value === "") {
      return undefined;
    }
    if (typeof field.value === "number" && Number.isFinite(field.value)) {
      return field.value;
    }
    if (typeof field.value === "string") {
      const trimmed = field.value.trim();
      if (trimmed.length === 0) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : field.value;
    }
    return field.value;
  }

  if (field.type === "boolean") {
    if (field.value === null || field.value === undefined || field.value === "") {
      return field.required ? false : undefined;
    }
    if (typeof field.value === "boolean") return field.value;
    if (typeof field.value === "string") {
      const lowered = field.value.trim().toLowerCase();
      if (lowered === "true") return true;
      if (lowered === "false") return false;
      return field.value;
    }
    return field.value;
  }

  if (field.type === "string[]") {
    const values = Array.isArray(field.value)
      ? field.value
      : typeof field.value === "string"
        ? field.value
            .split(/\r?\n/)
            .map((entry: string) => entry.trim())
            .filter(Boolean)
        : [];

    const normalized = values
      .map((entry: unknown) => String(entry).trim())
      .filter(Boolean);

    if (normalized.length === 0 && !field.required) return undefined;
    return normalized;
  }

  return field.value;
}

// ---------------------------------------------------------------------------
// Apply model to config
// ---------------------------------------------------------------------------

/**
 * Apply model field values back to a config object.
 * Returns a new config object with all field values written to their paths.
 */
export function applyPrefsModelToConfig(
  model: ConfigEditorModel,
  baseConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const nextConfig = baseConfig
    ? cloneConfig(baseConfig)
    : cloneConfig(model.workflow.config);

  for (const section of model.sections) {
    for (const field of section.fields) {
      const value = normalizeFieldValueForWrite(field);
      if (value === undefined) {
        deletePath(nextConfig, field.path);
      } else {
        setPath(nextConfig, field.path, value);
      }
    }
  }

  return nextConfig;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a config object to YAML frontmatter string (without `---` delimiters).
 * Produces trailing newline.
 */
function serializePrefsYaml(config: Record<string, unknown>): string {
  // For empty config, return empty string (no YAML to write)
  if (Object.keys(config).length === 0) return "";

  const serialized = dump(config, {
    noRefs: true,
    lineWidth: -1,
    quotingType: "'",
    forceQuotes: false,
  });

  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

/**
 * Serialize a `ConfigEditorModel` back to a complete `preferences.md` file.
 *
 * @param model - The model with current field values.
 * @param body - The markdown body to append after the frontmatter.
 * @returns The full file content: `---\n{yaml}\n---\n{body}`.
 */
export function writePreferencesFile(
  model: ConfigEditorModel,
  body: string,
): string {
  const config = applyPrefsModelToConfig(model);
  const yaml = serializePrefsYaml(config);

  // Reassemble: ---\n{yaml}---\n{body}
  // When yaml is empty (all fields unset), produce ---\n\n---
  if (!yaml) {
    return `---\n\n---\n${body}`;
  }

  return `---\n${yaml}---\n${body}`;
}
