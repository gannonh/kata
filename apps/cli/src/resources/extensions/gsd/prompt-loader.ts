/**
 * GSD Prompt Loader
 *
 * Reads .md prompt templates from the prompts/ directory and substitutes
 * {{variable}} placeholders with provided values.
 *
 * Templates live at prompts/ relative to this module's directory.
 * They use {{variableName}} syntax for substitution.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), "prompts");

/**
 * Load a prompt template and substitute variables.
 *
 * @param name - Template filename without .md extension (e.g. "execute-task")
 * @param vars - Key-value pairs to substitute for {{key}} placeholders
 */
export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const path = join(promptsDir, `${name}.md`);
  let content = readFileSync(path, "utf-8");

  // Check BEFORE substitution: find all {{varName}} placeholders the template
  // declares and verify every one has a value in vars. Checking after substitution
  // would also flag {{...}} patterns injected by inlined content (e.g. template
  // files embedded in {{inlinedContext}}), producing false positives.
  const declared = content.match(/\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/g);
  if (declared) {
    const missing = [...new Set(declared)]
      .map(m => m.slice(2, -2))
      .filter(key => !(key in vars));
    if (missing.length > 0) {
      throw new Error(
        `loadPrompt("${name}"): template declares {{${missing.join("}}, {{")}}}} but no value was provided. ` +
        `This usually means the extension code in memory is older than the template on disk. ` +
        `Restart pi to reload the extension.`
      );
    }
  }

  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  return content.trim();
}
