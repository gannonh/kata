/**
 * Kata Preferences Config Command
 *
 * Opens the section-based TUI editor for `.kata/preferences.md`.
 * Mirrors Symphony's `executeSymphonyConfigCommand` pattern:
 * lazy imports → file read → parse → ConfigEditor with ctx.ui bridge →
 * validation gate → file write.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ConfigEditorModel } from "../symphony/config-model.js";
import type { ConfigEditorUI } from "../symphony/config-editor.js";
import { getProjectKataPreferencesPath } from "./preferences.js";

export async function executePreferencesConfigCommand(
  ctx: ExtensionCommandContext,
): Promise<void> {
  // ── Lazy imports ──────────────────────────────────────────────────────────
  // These modules depend on js-yaml which may not be resolvable from the
  // extension loader's context. Lazy-import and catch resolution failures.

  let parsePreferencesFile: typeof import("./prefs-parser.js").parsePreferencesFile;
  let PreferencesParseError: typeof import("./prefs-parser.js").PreferencesParseError;
  let writePreferencesFile: typeof import("./prefs-writer.js").writePreferencesFile;
  let validatePreferencesModel: typeof import("./prefs-validator.js").validatePreferencesModel;
  let runConfigEditor: typeof import("../symphony/config-editor.js").runConfigEditor;

  try {
    ({ parsePreferencesFile, PreferencesParseError } = await import("./prefs-parser.js"));
    ({ writePreferencesFile } = await import("./prefs-writer.js"));
    ({ validatePreferencesModel } = await import("./prefs-validator.js"));
    ({ runConfigEditor } = await import("../symphony/config-editor.js"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const isJsYaml =
      detail.toLowerCase().includes("js-yaml") ||
      detail.toLowerCase().includes("cannot find module");
    const message = isJsYaml
      ? "Kata config editor requires the js-yaml package which could not be resolved. " +
        "Install js-yaml in your project directory (npm install js-yaml) and run kata from there."
      : "Failed to load Kata config editor modules.";
    ctx.ui.notify(`${message} (${detail})`, "error");
    return;
  }

  // ── Resolve preferences file ─────────────────────────────────────────────

  const prefsPath = getProjectKataPreferencesPath();

  if (!existsSync(prefsPath)) {
    try {
      const { ensurePreferences } = await import("./gitignore.js");
      ensurePreferences(process.cwd());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(
        `Failed to create preferences file at ${prefsPath}: ${message}`,
        "error",
      );
      return;
    }
  }

  // ── Read file ─────────────────────────────────────────────────────────────

  let content: string;
  try {
    content = readFileSync(prefsPath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Unable to read ${prefsPath}: ${message}`, "error");
    return;
  }

  // ── Parse ─────────────────────────────────────────────────────────────────

  let model: ConfigEditorModel;
  let body: string;
  try {
    const parsed = parsePreferencesFile(content);
    model = parsed.model;
    body = parsed.body;
  } catch (error) {
    if (error instanceof PreferencesParseError) {
      const lineInfo = error.line ? ` (line ${error.line})` : "";
      ctx.ui.notify(
        `Failed to parse preferences${lineInfo}: ${error.message}`,
        "error",
      );
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to parse ${prefsPath}: ${message}`, "error");
    return;
  }

  // ── Open editor ───────────────────────────────────────────────────────────

  ctx.ui.notify(`config_editor_opened: ${prefsPath}`, "info");

  const ui: ConfigEditorUI = {
    select: (title, options) => ctx.ui.select(title, options),
    input: (title, placeholder) => ctx.ui.input(title, placeholder),
    confirm: (title, message) => ctx.ui.confirm(title, message),
    editor: (title, prefill) => ctx.ui.editor(title, prefill),
    notify: (message, type) => ctx.ui.notify(message, type),
  };

  const editorResult = await runConfigEditor(model, ui, {
    title: "Kata Preferences Editor",
    workflowPath: prefsPath,
  });

  // ── Handle cancel ─────────────────────────────────────────────────────────

  if (editorResult.type === "cancelled") {
    ctx.ui.notify("Config editor cancelled.", "warning");
    return;
  }

  // ── Validate ──────────────────────────────────────────────────────────────

  const validationIssues = validatePreferencesModel(editorResult.model);

  if (validationIssues.length > 0) {
    const summary = validationIssues
      .slice(0, 20)
      .map((issue) => `- ${issue.path}: ${issue.message}`)
      .join("\n");

    ctx.ui.notify(`config_editor_validation_failed\n${summary}`, "error");
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  try {
    const output = writePreferencesFile(editorResult.model, body);
    writeFileSync(prefsPath, output, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to write ${prefsPath}: ${message}`, "error");
    return;
  }

  const diffLines = editorResult.changes.slice(0, 20).join("\n");
  ctx.ui.notify(
    `config_editor_saved: ${prefsPath}\n${editorResult.changes.length} change(s)\n${diffLines}`,
    "info",
  );
}
