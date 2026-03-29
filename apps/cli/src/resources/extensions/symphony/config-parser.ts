import { dump, load, type YAMLException } from "js-yaml";
import {
  cloneConfig,
  CONFIG_FIELD_DEFINITIONS,
  CONFIG_SECTION_DEFINITIONS,
  getFieldDefinitionsForSection,
  type ConfigEditorModel,
  type ConfigField,
  type ConfigFieldDefinition,
  type ConfigSection,
  type ConfigSectionKey,
  type WorkflowFrontmatter,
} from "./config-model.js";

const TOP_LEVEL_KEY_ORDER = [
  "tracker",
  "polling",
  "workspace",
  "agent",
  "codex",
  "kata_agent",
  "pi_agent",
  "notifications",
  "prompts",
  "hooks",
  "worker",
  "server",
];

const TOP_LEVEL_ORDER_INDEX = new Map(
  TOP_LEVEL_KEY_ORDER.map((key, index) => [key, index]),
);

export interface ParsedWorkflowSegments {
  frontmatter: string;
  body: string;
}

export interface ParseWorkflowConfigOptions {
  filePath?: string;
}

export class WorkflowConfigParseError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(message);
    this.name = "WorkflowConfigParseError";
    this.line = line;
  }
}

export function parseWorkflowConfig(
  workflowContent: string,
  _options: ParseWorkflowConfigOptions = {},
): ConfigEditorModel {
  const segments = extractWorkflowSegments(workflowContent);
  const config = parseYamlObject(segments.frontmatter);

  const workflow: WorkflowFrontmatter = {
    config,
    raw: segments.frontmatter,
    body: segments.body,
  };

  const sections = CONFIG_SECTION_DEFINITIONS.map((sectionDefinition) =>
    buildSection(sectionDefinition.key, workflow.config),
  ) as ConfigEditorModel["sections"];

  return {
    sections,
    workflow,
  };
}

export function extractWorkflowSegments(content: string): ParsedWorkflowSegments {
  const normalized = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const match = normalized.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!match) {
    throw new WorkflowConfigParseError(
      "WORKFLOW.md must begin with YAML frontmatter delimited by ---",
    );
  }

  return {
    frontmatter: match[1],
    body: normalized.slice(match[0].length),
  };
}

export function applyModelToConfig(
  model: ConfigEditorModel,
  baseConfig: Record<string, unknown> = model.workflow.config,
): Record<string, unknown> {
  const nextConfig = cloneConfig(baseConfig);

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

export function serializeWorkflowFrontmatter(
  config: Record<string, unknown>,
): string {
  const serialized = dump(config, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: compareYamlKeys,
  });

  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function serializeWorkflowConfig(model: ConfigEditorModel): string {
  const nextConfig = applyModelToConfig(model);
  const nextFrontmatter = serializeWorkflowFrontmatter(nextConfig);
  const body = model.workflow.body;

  return `---\n${nextFrontmatter}---${body.length > 0 ? `\n${body}` : "\n"}`;
}

function buildSection(
  key: ConfigSectionKey,
  config: Record<string, unknown>,
): ConfigSection {
  const definition = CONFIG_SECTION_DEFINITIONS.find(
    (candidate) => candidate.key === key,
  );
  if (!definition) {
    throw new Error(`Unknown section key: ${key}`);
  }

  const fields: ConfigField[] = getFieldDefinitionsForSection(key).map((field) => ({
    key: field.key,
    label: field.label,
    path: field.path,
    type: field.type,
    value: coerceFieldValue(readPath(config, field.path), field),
    required: !!field.required,
    description: field.description,
    ...(field.enumValues ? { enumValues: [...field.enumValues] } : {}),
    ...(field.sensitive ? { sensitive: true } : {}),
  }));

  return {
    key,
    label: definition.label,
    description: definition.description,
    fields,
  };
}

function parseYamlObject(frontmatter: string): Record<string, unknown> {
  try {
    const parsed = load(frontmatter) ?? {};

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    throw new WorkflowConfigParseError(
      "YAML frontmatter must parse to an object at the top level",
    );
  } catch (error) {
    if (error instanceof WorkflowConfigParseError) {
      throw error;
    }

    const yamlError = error as YAMLException & {
      mark?: { line?: number };
      message?: string;
    };

    const line =
      typeof yamlError.mark?.line === "number" ? yamlError.mark.line + 1 : undefined;
    const message = yamlError.message ?? "Failed to parse YAML frontmatter";

    throw new WorkflowConfigParseError(message, line);
  }
}

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

function coerceFieldValue(
  value: unknown,
  definition: ConfigFieldDefinition,
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
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return definition.required ? false : null;
      }

      const lowered = trimmed.toLowerCase();
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
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    return [];
  }

  return value;
}

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

    if (typeof field.value === "boolean") {
      return field.value;
    }

    if (typeof field.value === "string") {
      const trimmed = field.value.trim();
      if (trimmed.length === 0) {
        return field.required ? false : undefined;
      }

      const lowered = trimmed.toLowerCase();
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
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];

    const normalized = values
      .map((entry) => String(entry).trim())
      .filter(Boolean);

    if (normalized.length === 0 && !field.required) {
      return undefined;
    }

    return normalized;
  }

  return field.value;
}

export function setPath(root: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) {
    console.warn("[symphony-config] setPath called with empty path; skipping write");
    return;
  }

  let current: Record<string, unknown> = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = current[segment];

    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}

export function deletePath(root: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) {
    console.warn("[symphony-config] deletePath called with empty path; skipping delete");
    return;
  }

  const trail: Array<{ node: Record<string, unknown>; key: string }> = [];
  let current: Record<string, unknown> = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return;
    }
    trail.push({ node: current, key: segment });
    current = next as Record<string, unknown>;
  }

  delete current[path[path.length - 1]];

  for (let index = trail.length - 1; index >= 0; index -= 1) {
    const { node, key } = trail[index];
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

function compareYamlKeys(a: string, b: string): number {
  const left = TOP_LEVEL_ORDER_INDEX.get(a);
  const right = TOP_LEVEL_ORDER_INDEX.get(b);

  if (left !== undefined && right !== undefined) {
    return left - right;
  }

  if (left !== undefined) return -1;
  if (right !== undefined) return 1;

  return a.localeCompare(b);
}

export function updateModelFieldValue(
  model: ConfigEditorModel,
  sectionKey: ConfigSectionKey,
  fieldKey: string,
  value: unknown,
): ConfigEditorModel {
  const next = cloneConfig(model);
  const section = next.sections.find((candidate) => candidate.key === sectionKey);
  if (!section) return next;

  const field = section.fields.find((candidate) => candidate.key === fieldKey);
  if (!field) return next;

  field.value = value;
  return next;
}

export function listEditableFields(model: ConfigEditorModel): ConfigFieldDefinition[] {
  const activePaths = new Set<string>();
  for (const section of model.sections) {
    for (const field of section.fields) {
      activePaths.add(field.path.join("."));
    }
  }

  return CONFIG_FIELD_DEFINITIONS.filter((definition) =>
    activePaths.has(definition.path.join(".")),
  );
}
