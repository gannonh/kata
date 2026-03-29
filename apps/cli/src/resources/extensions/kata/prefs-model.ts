/**
 * Preferences field model for the Kata config editor.
 *
 * Defines section definitions, field definitions, and `buildPreferencesModel()`
 * which takes a parsed YAML config and returns a `ConfigEditorModel` compatible
 * with Symphony's `ConfigEditor`.
 */

import type {
  ConfigEditorModel,
  ConfigField,
  ConfigFieldType,
  ConfigSection,
  ConfigSectionKey,
  WorkflowFrontmatter,
} from "../symphony/config-model.js";

// ---------------------------------------------------------------------------
// Section keys
// ---------------------------------------------------------------------------

export type PrefsSectionKey =
  | "general"
  | "workflow"
  | "linear"
  | "pr"
  | "models"
  | "symphony"
  | "skills"
  | "auto_supervisor";

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

export interface PrefsSectionDefinition {
  key: PrefsSectionKey;
  label: string;
  description: string;
}

export const PREFS_SECTION_DEFINITIONS: readonly PrefsSectionDefinition[] = [
  {
    key: "general",
    label: "General",
    description: "Schema version, UAT dispatch, and budget settings.",
  },
  {
    key: "workflow",
    label: "Workflow",
    description: "Workflow-mode configuration.",
  },
  {
    key: "linear",
    label: "Linear",
    description: "Linear binding configuration for Linear-backed workflow.",
  },
  {
    key: "pr",
    label: "PR",
    description: "Pull request lifecycle configuration.",
  },
  {
    key: "models",
    label: "Models",
    description: "Per-stage model selection for auto-mode, step mode, and PR review.",
  },
  {
    key: "symphony",
    label: "Symphony",
    description: "Symphony orchestration server configuration.",
  },
  {
    key: "skills",
    label: "Skills",
    description: "Skill routing, discovery, and custom instructions.",
  },
  {
    key: "auto_supervisor",
    label: "Auto Supervisor",
    description: "Auto-mode supervisor timeouts and model configuration.",
  },
] as const;

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export interface PrefsFieldDefinition {
  section: PrefsSectionKey;
  key: string;
  label: string;
  path: string[];
  type: ConfigFieldType;
  required?: boolean;
  description: string;
  enumValues?: string[];
}

export const PREFS_FIELD_DEFINITIONS: readonly PrefsFieldDefinition[] = [
  // ── General ───────────────────────────────────────────────────────────────
  {
    section: "general",
    key: "version",
    label: "Version",
    path: ["version"],
    type: "number",
    description: "Schema version. Start at 1.",
  },
  {
    section: "general",
    key: "uat_dispatch",
    label: "UAT Dispatch",
    path: ["uat_dispatch"],
    type: "boolean",
    description: "Enable UAT dispatch for acceptance testing.",
  },
  {
    section: "general",
    key: "budget_ceiling",
    label: "Budget Ceiling",
    path: ["budget_ceiling"],
    type: "number",
    description: "Maximum budget ceiling for auto-mode operations.",
  },

  // ── Workflow ──────────────────────────────────────────────────────────────
  {
    section: "workflow",
    key: "mode",
    label: "Mode",
    path: ["workflow", "mode"],
    type: "enum",
    enumValues: ["linear"],
    description: "Workflow mode. Currently only 'linear' is supported.",
  },

  // ── Linear ────────────────────────────────────────────────────────────────
  {
    section: "linear",
    key: "teamKey",
    label: "Team Key",
    path: ["linear", "teamKey"],
    type: "string",
    description: "Linear team key such as KAT.",
  },
  {
    section: "linear",
    key: "projectSlug",
    label: "Project Slug",
    path: ["linear", "projectSlug"],
    type: "string",
    description:
      "Linear project slug ID (from the project URL). Preferred over projectId.",
  },
  {
    section: "linear",
    key: "teamId",
    label: "Team ID",
    path: ["linear", "teamId"],
    type: "string",
    description: "Optional Linear team UUID.",
  },
  {
    section: "linear",
    key: "projectId",
    label: "Project ID",
    path: ["linear", "projectId"],
    type: "string",
    description:
      "Optional Linear project UUID. Supported for backward compatibility; prefer projectSlug.",
  },

  // ── PR ────────────────────────────────────────────────────────────────────
  {
    section: "pr",
    key: "enabled",
    label: "Enabled",
    path: ["pr", "enabled"],
    type: "boolean",
    description: "Set to true to activate the PR lifecycle.",
  },
  {
    section: "pr",
    key: "auto_create",
    label: "Auto Create",
    path: ["pr", "auto_create"],
    type: "boolean",
    description:
      "Automatically open a PR after each slice completes in auto-mode.",
  },
  {
    section: "pr",
    key: "base_branch",
    label: "Base Branch",
    path: ["pr", "base_branch"],
    type: "string",
    description: "Target branch for PRs (default: main).",
  },
  {
    section: "pr",
    key: "review_on_create",
    label: "Review on Create",
    path: ["pr", "review_on_create"],
    type: "boolean",
    description:
      "Automatically run parallel reviewer subagents after PR creation.",
  },
  {
    section: "pr",
    key: "linear_link",
    label: "Linear Link",
    path: ["pr", "linear_link"],
    type: "boolean",
    description:
      "Include Linear issue references in PR bodies and update Linear issues on merge.",
  },

  // ── Models ────────────────────────────────────────────────────────────────
  {
    section: "models",
    key: "research",
    label: "Research",
    path: ["models", "research"],
    type: "string",
    description: "Model ID for research stages.",
  },
  {
    section: "models",
    key: "planning",
    label: "Planning",
    path: ["models", "planning"],
    type: "string",
    description: "Model ID for planning stages.",
  },
  {
    section: "models",
    key: "execution",
    label: "Execution",
    path: ["models", "execution"],
    type: "string",
    description: "Model ID for execution stages.",
  },
  {
    section: "models",
    key: "completion",
    label: "Completion",
    path: ["models", "completion"],
    type: "string",
    description: "Model ID for completion stages.",
  },
  {
    section: "models",
    key: "review",
    label: "Review",
    path: ["models", "review"],
    type: "string",
    description: "Model ID for PR reviewer subagents.",
  },

  // ── Symphony ──────────────────────────────────────────────────────────────
  {
    section: "symphony",
    key: "url",
    label: "URL",
    path: ["symphony", "url"],
    type: "string",
    description: "Base URL for the Symphony server.",
  },
  {
    section: "symphony",
    key: "workflow_path",
    label: "Workflow Path",
    path: ["symphony", "workflow_path"],
    type: "string",
    description: "Absolute path to the Symphony WORKFLOW.md file.",
  },
  {
    section: "symphony",
    key: "console_position",
    label: "Console Position",
    path: ["symphony", "console_position"],
    type: "enum",
    enumValues: ["below-output", "above-status"],
    description: "Placement of the /symphony console panel in the TUI.",
  },

  // ── Skills ────────────────────────────────────────────────────────────────
  {
    section: "skills",
    key: "always_use_skills",
    label: "Always Use Skills",
    path: ["always_use_skills"],
    type: "string[]",
    description: "Skills Kata should use whenever they are relevant.",
  },
  {
    section: "skills",
    key: "prefer_skills",
    label: "Prefer Skills",
    path: ["prefer_skills"],
    type: "string[]",
    description: "Soft defaults Kata should prefer when relevant.",
  },
  {
    section: "skills",
    key: "avoid_skills",
    label: "Avoid Skills",
    path: ["avoid_skills"],
    type: "string[]",
    description: "Skills Kata should avoid unless clearly needed.",
  },
  {
    section: "skills",
    key: "skill_rules",
    label: "Skill Rules",
    path: ["skill_rules"],
    type: "string[]",
    description:
      "Situational rules with a when trigger and use/prefer/avoid actions. Edit as YAML text.",
  },
  {
    section: "skills",
    key: "custom_instructions",
    label: "Custom Instructions",
    path: ["custom_instructions"],
    type: "string[]",
    description: "Extra durable instructions related to skill use.",
  },
  {
    section: "skills",
    key: "skill_discovery",
    label: "Skill Discovery",
    path: ["skill_discovery"],
    type: "enum",
    enumValues: ["auto", "suggest", "off"],
    description:
      "Controls how Kata discovers and applies skills during auto-mode.",
  },

  // ── Auto Supervisor ───────────────────────────────────────────────────────
  {
    section: "auto_supervisor",
    key: "model",
    label: "Model",
    path: ["auto_supervisor", "model"],
    type: "string",
    description: "Model ID for the supervisor process.",
  },
  {
    section: "auto_supervisor",
    key: "soft_timeout_minutes",
    label: "Soft Timeout (min)",
    path: ["auto_supervisor", "soft_timeout_minutes"],
    type: "number",
    description: "Minutes before the supervisor issues a soft warning (default: 20).",
  },
  {
    section: "auto_supervisor",
    key: "idle_timeout_minutes",
    label: "Idle Timeout (min)",
    path: ["auto_supervisor", "idle_timeout_minutes"],
    type: "number",
    description:
      "Minutes of inactivity before the supervisor intervenes (default: 10).",
  },
  {
    section: "auto_supervisor",
    key: "hard_timeout_minutes",
    label: "Hard Timeout (min)",
    path: ["auto_supervisor", "hard_timeout_minutes"],
    type: "number",
    description:
      "Minutes before the supervisor forces termination (default: 30).",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getPrefsFieldDefinitionsForSection(
  sectionKey: PrefsSectionKey,
): PrefsFieldDefinition[] {
  return PREFS_FIELD_DEFINITIONS.filter((f) => f.section === sectionKey);
}

/**
 * Read a nested value from an object by path segments.
 * Returns `undefined` when any intermediate segment is missing.
 */
export function readPath(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

function coerceFieldValue(
  value: unknown,
  definition: PrefsFieldDefinition,
): unknown {
  if (definition.type === "string") {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map(String).join(" ");
    return String(value);
  }

  if (definition.type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    if (value === undefined || value === null) return null;
    return value;
  }

  if (definition.type === "boolean") {
    if (value === undefined || value === null) {
      return definition.required ? false : null;
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true") return true;
      if (lowered === "false") return false;
      return value;
    }
    return value;
  }

  if (definition.type === "enum") {
    if (value === undefined || value === null) return "";
    return String(value);
  }

  if (definition.type === "string[]") {
    if (Array.isArray(value)) return value.map((entry) => String(entry));
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    return [];
  }

  return value;
}

// ---------------------------------------------------------------------------
// Build model
// ---------------------------------------------------------------------------

function buildPrefsSection(
  sectionDef: PrefsSectionDefinition,
  config: Record<string, unknown>,
): ConfigSection {
  const fields: ConfigField[] = getPrefsFieldDefinitionsForSection(
    sectionDef.key,
  ).map((fieldDef) => ({
    key: fieldDef.key,
    label: fieldDef.label,
    path: fieldDef.path,
    type: fieldDef.type,
    value: coerceFieldValue(readPath(config, fieldDef.path), fieldDef),
    required: !!fieldDef.required,
    description: fieldDef.description,
    ...(fieldDef.enumValues ? { enumValues: [...fieldDef.enumValues] } : {}),
  }));

  return {
    key: sectionDef.key as ConfigSectionKey,
    label: sectionDef.label,
    description: sectionDef.description,
    fields,
  };
}

/**
 * Build a `ConfigEditorModel` from a parsed YAML config object.
 *
 * The returned model has 8 sections covering all `KataPreferences` fields.
 * The `workflow` field is populated with the config object; `raw` and `body`
 * are set to empty strings and should be populated by the parser (T03).
 */
export function buildPreferencesModel(
  config: Record<string, unknown>,
): ConfigEditorModel {
  const sections: ConfigSection[] = PREFS_SECTION_DEFINITIONS.map(
    (sectionDef) => buildPrefsSection(sectionDef, config),
  );

  const workflow: WorkflowFrontmatter = {
    config,
    raw: "",
    body: "",
  };

  return { sections, workflow };
}
