import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { SymphonyExtensionError } from "./errors.ts";

export const DEFAULT_SYMPHONY_WORKFLOW = ".symphony/WORKFLOW.md";
const LEGACY_SYMPHONY_WORKFLOW = "WORKFLOW.md";

export async function resolveStartWorkflow(cwd: string, workflow: string | undefined): Promise<string> {
  const explicitWorkflow = workflow?.trim();
  if (explicitWorkflow) {
    await assertWorkflowExists(cwd, explicitWorkflow);
    return explicitWorkflow;
  }

  for (const defaultWorkflow of [DEFAULT_SYMPHONY_WORKFLOW, LEGACY_SYMPHONY_WORKFLOW]) {
    if (await workflowExists(cwd, defaultWorkflow)) return defaultWorkflow;
  }

  throw new SymphonyExtensionError("missing_workflow", `Symphony workflow file not found: ${DEFAULT_SYMPHONY_WORKFLOW} or ${LEGACY_SYMPHONY_WORKFLOW}. Run /symphony:init first or pass a workflow path to /symphony:start <workflow>.`, {
    cwd,
    workflow: DEFAULT_SYMPHONY_WORKFLOW,
  });
}

async function assertWorkflowExists(cwd: string, workflow: string): Promise<void> {
  if (await workflowExists(cwd, workflow)) return;
  throw new SymphonyExtensionError("missing_workflow", `Symphony workflow file not found: ${workflow}. Run /symphony:init first or pass a workflow path to /symphony:start <workflow>.`, {
    cwd,
    workflow,
  });
}

async function workflowExists(cwd: string, workflow: string): Promise<boolean> {
  try {
    await access(resolve(cwd, workflow));
    return true;
  } catch {
    return false;
  }
}
