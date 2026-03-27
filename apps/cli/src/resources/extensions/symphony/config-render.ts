import {
  maskConfigValue,
  type ConfigEditorModel,
  type ConfigField,
  type ConfigSection,
} from "./config-model.js";

export interface ConfigEditorRenderOptions {
  connectionStatus?: string;
  workflowPath?: string;
}

export function renderConfigEditorHeader(
  model: ConfigEditorModel,
  options: ConfigEditorRenderOptions = {},
): string {
  const sectionCount = model.sections.length;
  const fieldCount = model.sections.reduce(
    (total, section) => total + section.fields.length,
    0,
  );

  const lines = [
    `Symphony Config Editor — ${sectionCount} sections, ${fieldCount} fields`,
    options.workflowPath ? `Workflow: ${options.workflowPath}` : "Workflow: (unknown)",
    options.connectionStatus
      ? `Symphony: ${options.connectionStatus}`
      : "Symphony: status unavailable",
  ];

  return lines.join("\n");
}

export function renderSectionChoice(section: ConfigSection): string {
  return `${section.label} (${section.fields.length} fields)`;
}

export function renderFieldChoice(field: ConfigField): string {
  const valueText = formatConfigFieldValue(field, { masked: true });
  const requiredSuffix = field.required ? "required" : "optional";
  return `${field.label} [${field.type}; ${requiredSuffix}] = ${valueText}`;
}

export function formatConfigFieldValue(
  field: ConfigField,
  options: { masked?: boolean } = {},
): string {
  if (field.value === undefined || field.value === null) return "(unset)";

  if (field.type === "string[]") {
    const values = Array.isArray(field.value)
      ? field.value.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    return values.length > 0 ? values.join(", ") : "(empty)";
  }

  if (field.type === "boolean") {
    return field.value ? "true" : "false";
  }

  const text = String(field.value);
  if (!text.trim()) return "(empty)";

  if (options.masked && field.sensitive) {
    return maskConfigValue(text);
  }

  return text;
}

export function normalizeStringArrayInput(input: string): string[] {
  return input
    .split(/\r?\n/)
    .flatMap((line) => line.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function summarizeConfigChanges(
  original: ConfigEditorModel,
  updated: ConfigEditorModel,
): string[] {
  const rows: string[] = [];

  for (const nextSection of updated.sections) {
    const previousSection = original.sections.find(
      (section) => section.key === nextSection.key,
    );
    if (!previousSection) continue;

    for (const nextField of nextSection.fields) {
      const previousField = previousSection.fields.find(
        (field) => field.key === nextField.key,
      );
      if (!previousField) continue;

      if (!areFieldValuesEqual(previousField.value, nextField.value)) {
        rows.push(
          `${nextSection.key}.${nextField.key}: ${formatConfigFieldValue(previousField, {
            masked: true,
          })} -> ${formatConfigFieldValue(nextField, { masked: true })}`,
        );
      }
    }
  }

  return rows;
}

function areFieldValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftValues = Array.isArray(left) ? left.map(String) : [];
    const rightValues = Array.isArray(right) ? right.map(String) : [];
    if (leftValues.length !== rightValues.length) return false;
    return leftValues.every((value, index) => value === rightValues[index]);
  }

  return left === right;
}
