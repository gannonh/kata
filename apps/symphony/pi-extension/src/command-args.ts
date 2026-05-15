export interface InitArgs {
  force: boolean;
}

export interface WorkflowArgs {
  workflow?: string;
}

export interface AttachArgs {
  url: string;
}

export interface SteerArgs {
  issueIdentifier: string;
  instruction: string;
}

export function parseInitArgs(args: string): InitArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let force = false;
  for (const token of tokens) {
    if (token === "--force") {
      force = true;
      continue;
    }
    throw new Error(`Unknown /symphony:init option: ${token}`);
  }
  return { force };
}

export function parseDoctorArgs(args: string): WorkflowArgs {
  return parseWorkflowArg(args);
}

export function parseStartArgs(args: string): WorkflowArgs {
  return parseWorkflowArg(args);
}

function parseWorkflowArg(args: string): WorkflowArgs {
  const workflow = args.trim();
  return workflow ? { workflow } : { workflow: undefined };
}

export function parseAttachArgs(args: string): AttachArgs {
  const url = args.trim();
  if (!url) throw new Error("Usage: /symphony:attach <url>");
  return { url };
}

export function parseSteerArgs(args: string): SteerArgs {
  const trimmed = args.trim();
  const firstSpaceIndex = trimmed.search(/\s/);
  if (!trimmed || firstSpaceIndex === -1) throw new Error("Usage: /symphony:steer <ISSUE> <instruction>");

  const issueIdentifier = trimmed.slice(0, firstSpaceIndex).trim();
  const instruction = trimmed.slice(firstSpaceIndex).trim();
  if (!issueIdentifier || !instruction) throw new Error("Usage: /symphony:steer <ISSUE> <instruction>");
  return { issueIdentifier, instruction };
}
