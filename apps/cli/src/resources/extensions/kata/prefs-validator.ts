/**
 * Preferences field validator.
 *
 * Validates a `ConfigEditorModel` produced by the preferences parser,
 * checking enum values, number types, and boolean types before the writer
 * persists them. Returns `ConfigValidationIssue[]` matching Symphony's
 * validator interface.
 */

import type { ConfigEditorModel } from "../symphony/config-model.js";
import { PREFS_FIELD_DEFINITIONS } from "./prefs-model.js";
import { applyPrefsModelToConfig } from "./prefs-writer.js";
import { readPath } from "./prefs-model.js";

// Re-export ConfigValidationIssue so consumers don't need a separate import
export type { ConfigValidationIssue } from "../symphony/config-validator.js";
import type { ConfigValidationIssue } from "../symphony/config-validator.js";

// ---------------------------------------------------------------------------
// Enum value set (same pattern as Symphony's ENUM_VALUE_SET)
// ---------------------------------------------------------------------------

const PREFS_ENUM_VALUE_SET = new Map(
  PREFS_FIELD_DEFINITIONS.filter((field) => field.type === "enum").map((field) => [
    field.path.join("."),
    new Set(field.enumValues ?? []),
  ]),
);

// ---------------------------------------------------------------------------
// Number field paths
// ---------------------------------------------------------------------------

const NUMBER_FIELD_PATHS = PREFS_FIELD_DEFINITIONS.filter(
  (field) => field.type === "number",
).map((field) => ({
  path: field.path,
  dotPath: field.path.join("."),
  label: field.label,
}));

// ---------------------------------------------------------------------------
// Boolean field paths
// ---------------------------------------------------------------------------

const BOOLEAN_FIELD_PATHS = PREFS_FIELD_DEFINITIONS.filter(
  (field) => field.type === "boolean",
).map((field) => ({
  path: field.path,
  dotPath: field.path.join("."),
  label: field.label,
}));

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate a preferences `ConfigEditorModel` and return issues found.
 *
 * Checks:
 * 1. Enum fields have valid values (or are empty/unset).
 * 2. Number fields are finite numbers and non-negative where applicable.
 * 3. Boolean fields are actual booleans (not strings).
 *
 * Empty/unset optional fields are accepted gracefully.
 * Returns an empty array when the model is fully valid.
 */
export function validatePreferencesModel(
  model: ConfigEditorModel,
): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const config = applyPrefsModelToConfig(model);

  assertEnumValues(config, issues);
  assertNumberFields(config, issues);
  assertBooleanFields(config, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertEnumValues(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  for (const [path, allowedValues] of PREFS_ENUM_VALUE_SET) {
    const value = readPath(config, path.split("."));
    // Accept empty/unset optional fields
    if (value === undefined || value === null || value === "") continue;

    if (typeof value !== "string" || !allowedValues.has(value)) {
      issues.push({
        path,
        message: `${path} must be one of: ${Array.from(allowedValues).join(", ")}`,
      });
    }
  }
}

function assertNumberFields(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  for (const { path, dotPath } of NUMBER_FIELD_PATHS) {
    const value = readPath(config, path);
    // Accept empty/unset optional fields
    if (value === undefined || value === null) continue;

    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push({
        path: dotPath,
        message: `${dotPath} must be a valid number`,
      });
      continue;
    }

    if (value < 0) {
      issues.push({
        path: dotPath,
        message: `${dotPath} must be non-negative`,
      });
    }
  }
}

function assertBooleanFields(
  config: Record<string, unknown>,
  issues: ConfigValidationIssue[],
): void {
  for (const { path, dotPath } of BOOLEAN_FIELD_PATHS) {
    const value = readPath(config, path);
    // Accept empty/unset optional fields
    if (value === undefined || value === null) continue;

    if (typeof value !== "boolean") {
      issues.push({
        path: dotPath,
        message: `${dotPath} must be a boolean (true or false)`,
      });
    }
  }
}
