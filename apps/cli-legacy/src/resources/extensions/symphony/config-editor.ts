import { cloneConfig, type ConfigEditorModel, type ConfigField } from "./config-model.js";
import {
  formatConfigFieldValue,
  normalizeStringArrayInput,
  renderConfigEditorHeader,
  renderFieldChoice,
  renderSectionChoice,
  summarizeConfigChanges,
  type ConfigEditorRenderOptions,
} from "./config-render.js";

export interface ConfigEditorUI {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  editor?: (title: string, prefill?: string) => Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface ConfigEditorOptions extends ConfigEditorRenderOptions {
  saveLabel?: string;
  cancelLabel?: string;
}

export type ConfigEditorResult =
  | {
      type: "saved";
      model: ConfigEditorModel;
      changes: string[];
    }
  | {
      type: "cancelled";
      model: ConfigEditorModel;
    };

export class ConfigEditor {
  private readonly ui: ConfigEditorUI;
  private readonly options: Required<Pick<ConfigEditorOptions, "saveLabel" | "cancelLabel">> &
    Omit<ConfigEditorOptions, "saveLabel" | "cancelLabel">;

  constructor(
    private model: ConfigEditorModel,
    ui: ConfigEditorUI,
    options: ConfigEditorOptions = {},
  ) {
    this.ui = ui;
    this.options = {
      saveLabel: options.saveLabel ?? "Save changes",
      cancelLabel: options.cancelLabel ?? "Cancel",
      ...options,
    };
  }

  async run(): Promise<ConfigEditorResult> {
    const original = cloneConfig(this.model);

    while (true) {
      const sectionChoices = this.model.sections.map(renderSectionChoice);
      sectionChoices.push(`✓ ${this.options.saveLabel}`);
      sectionChoices.push(`✕ ${this.options.cancelLabel}`);

      const selection = await this.ui.select(
        renderConfigEditorHeader(this.model, this.options),
        sectionChoices,
      );

      if (!selection || selection === `✕ ${this.options.cancelLabel}`) {
        return { type: "cancelled", model: this.model };
      }

      if (selection === `✓ ${this.options.saveLabel}`) {
        const changes = summarizeConfigChanges(original, this.model);
        if (changes.length === 0) {
          this.ui.notify("No config changes detected.", "warning");
          continue;
        }

        const confirmed = await this.ui.confirm(
          "Save Symphony config?",
          changes.slice(0, 20).join("\n"),
        );

        if (!confirmed) {
          this.ui.notify("Save cancelled.", "warning");
          continue;
        }

        return {
          type: "saved",
          model: this.model,
          changes,
        };
      }

      const sectionIndex = sectionChoices.indexOf(selection);
      const section = this.model.sections[sectionIndex];
      if (!section) continue;

      await this.editSection(sectionIndex);
    }
  }

  private async editSection(sectionIndex: number): Promise<void> {
    const section = this.model.sections[sectionIndex];

    while (true) {
      const fieldChoices = section.fields.map(renderFieldChoice);
      fieldChoices.push("← Back");

      const selection = await this.ui.select(
        `${section.label}\n${section.description}`,
        fieldChoices,
      );

      if (!selection || selection === "← Back") {
        return;
      }

      const fieldIndex = fieldChoices.indexOf(selection);
      const field = section.fields[fieldIndex];
      if (!field) continue;

      const updatedField = await this.editField(field);
      if (updatedField) {
        section.fields[fieldIndex] = updatedField;
      }
    }
  }

  private async editField(field: ConfigField): Promise<ConfigField | null> {
    if (field.type === "enum") {
      const options = field.enumValues ? [...field.enumValues] : [];
      if (!field.required) {
        options.push("(unset)");
      }

      const selected = await this.ui.select(
        this.renderFieldPrompt(field),
        options.length > 0 ? options : [String(field.value ?? "")],
      );
      if (!selected) return null;

      if (selected === "(unset)") {
        return {
          ...field,
          value: "",
        };
      }

      return {
        ...field,
        value: selected,
      };
    }

    if (field.type === "boolean") {
      const choices = field.required ? ["true", "false"] : ["(unset)", "true", "false"];
      const selected = await this.ui.select(this.renderFieldPrompt(field), choices);
      if (!selected) return null;

      if (selected === "(unset)") {
        return {
          ...field,
          value: null,
        };
      }

      return {
        ...field,
        value: selected === "true",
      };
    }

    if (field.type === "number") {
      const typed = await this.ui.input(
        this.renderFieldPrompt(field),
        field.value === null || field.value === undefined ? "" : String(field.value),
      );
      if (typed === undefined) return null;
      const trimmed = typed.trim();
      if (!trimmed) {
        return {
          ...field,
          value: null,
        };
      }

      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        this.ui.notify(`Invalid number for ${field.label}: ${typed}`, "error");
        return null;
      }

      return {
        ...field,
        value: numeric,
      };
    }

    if (field.type === "string[]") {
      const prefill = Array.isArray(field.value) ? field.value.join("\n") : "";
      const prompt = `${this.renderFieldPrompt(field)}\n(Enter one value per line)`;
      const typed = this.ui.editor
        ? await this.ui.editor(prompt, prefill)
        : await this.ui.input(prompt, prefill);
      if (typed === undefined) return null;

      return {
        ...field,
        value: normalizeStringArrayInput(typed),
      };
    }

    const typed = await this.ui.input(
      this.renderFieldPrompt(field),
      field.sensitive ? "(hidden)" : String(field.value ?? ""),
    );
    if (typed === undefined) return null;

    return {
      ...field,
      value: typed,
    };
  }

  private renderFieldPrompt(field: ConfigField): string {
    return [
      `${field.label}${field.required ? " (required)" : ""}`,
      field.description,
      `Current: ${formatConfigFieldValue(field, { masked: true })}`,
    ].join("\n");
  }
}

export async function runConfigEditor(
  model: ConfigEditorModel,
  ui: ConfigEditorUI,
  options: ConfigEditorOptions = {},
): Promise<ConfigEditorResult> {
  const editor = new ConfigEditor(model, ui, options);
  return editor.run();
}
