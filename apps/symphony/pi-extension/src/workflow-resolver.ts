import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { SymphonyExtensionError } from "./errors.ts";

export const DEFAULT_SYMPHONY_WORKFLOW = ".symphony/WORKFLOW.md";

export async function resolveStartWorkflow(cwd: string, workflow: string | undefined): Promise<string> {
  const resolvedWorkflow = workflow?.trim() || DEFAULT_SYMPHONY_WORKFLOW;
  try {
    await access(resolve(cwd, resolvedWorkflow));
    return resolvedWorkflow;
  } catch {
    throw new SymphonyExtensionError("missing_workflow", `Symphony workflow file not found: ${resolvedWorkflow}. Run /symphony:init first or pass a workflow path to /symphony:start <workflow>.`, {
      cwd,
      workflow: resolvedWorkflow,
    });
  }
}
