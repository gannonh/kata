import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(cliRoot, "skills-src");
const targetDir = path.join(cliRoot, "skills");

const supportedOperations = new Set([
  "project.getContext",
  "project.upsert",
  "milestone.list",
  "milestone.getActive",
  "milestone.create",
  "milestone.complete",
  "slice.list",
  "slice.create",
  "slice.updateStatus",
  "task.list",
  "task.create",
  "task.updateStatus",
  "artifact.list",
  "artifact.read",
  "artifact.write",
  "execution.getStatus",
  "health.check",
]);

const requiredSkillNames = [
  "kata-complete-milestone",
  "kata-execute-phase",
  "kata-health",
  "kata-new-milestone",
  "kata-new-project",
  "kata-plan-phase",
  "kata-progress",
  "kata-setup",
  "kata-verify-work",
];

const inputRequiredOperations = new Set([
  "project.upsert",
  "milestone.create",
  "milestone.complete",
  "slice.list",
  "slice.create",
  "slice.updateStatus",
  "task.list",
  "task.create",
  "task.updateStatus",
  "artifact.list",
  "artifact.read",
  "artifact.write",
]);

const skillCallCommand = "node <path-to-skill-directory>/scripts/kata-call.mjs";

function normalizeSkillCommandReferences(markdown) {
  return markdown.replaceAll("node ./scripts/kata-call.mjs", skillCallCommand);
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function requireString(value, fieldName, skillName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Skill "${skillName}" is missing required "${fieldName}" string.`);
  }
}

async function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.skills)) {
    throw new Error("skills-src/manifest.json must contain a top-level skills array.");
  }

  const names = manifest.skills.map((skill) => skill.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(requiredSkillNames)) {
    throw new Error(`skills-src/manifest.json must expose exactly: ${requiredSkillNames.join(", ")}.`);
  }

  for (const skill of manifest.skills) {
    requireString(skill.name, "name", "<unknown>");
    requireString(skill.description, "description", skill.name);
    requireString(skill.workflow, "workflow", skill.name);
    requireString(skill.setupHint, "setupHint", skill.name);

    if (!Array.isArray(skill.contractOperations)) {
      throw new Error(`Skill "${skill.name}" must declare contractOperations as an array.`);
    }
    if (!Array.isArray(skill.operatingBrief) || skill.operatingBrief.length === 0) {
      throw new Error(`Skill "${skill.name}" must declare operatingBrief as a non-empty array.`);
    }
    if (!Array.isArray(skill.successCriteria) || skill.successCriteria.length === 0) {
      throw new Error(`Skill "${skill.name}" must declare successCriteria as a non-empty array.`);
    }
    if (!Array.isArray(skill.doNot) || skill.doNot.length === 0) {
      throw new Error(`Skill "${skill.name}" must declare doNot as a non-empty array.`);
    }
    if (!Array.isArray(skill.requiredReferences)) {
      throw new Error(`Skill "${skill.name}" must declare requiredReferences as an array.`);
    }
    if (!Array.isArray(skill.requiredTemplates)) {
      throw new Error(`Skill "${skill.name}" must declare requiredTemplates as an array.`);
    }

    for (const operation of skill.contractOperations) {
      if (!supportedOperations.has(operation)) {
        throw new Error(`Skill "${skill.name}" declares unsupported contract operation: ${operation}`);
      }
    }

    const workflowPath = path.join(sourceRoot, "workflows", `${skill.workflow}.md`);
    if (!(await pathExists(workflowPath))) {
      throw new Error(`Skill "${skill.name}" points to missing workflow: ${workflowPath}`);
    }
    for (const reference of skill.requiredReferences) {
      const referencePath = path.join(sourceRoot, "references", `${reference}.md`);
      if (!(await pathExists(referencePath))) {
        throw new Error(`Skill "${skill.name}" requires missing reference: ${referencePath}`);
      }
    }
    for (const template of skill.requiredTemplates) {
      const templatePath = path.join(sourceRoot, "templates", `${template}.md`);
      if (!(await pathExists(templatePath))) {
        throw new Error(`Skill "${skill.name}" requires missing template: ${templatePath}`);
      }
    }
  }
}

function renderContractOperations(skill) {
  if (skill.runtimeRequired === false && skill.contractOperations.length === 0) {
    return "This setup skill does not require runtime contract operations.";
  }

  const lines = ["Use only these typed runtime operations:", ""];
  for (const operation of skill.contractOperations) {
    lines.push(`## \`${operation}\``, "");
    if (inputRequiredOperations.has(operation)) {
      const inputPath = `/tmp/kata-${operation.replace(".", "-")}.json`;
      lines.push("Create a JSON payload file first, then run:", "");
      lines.push("```bash");
      lines.push(`${skillCallCommand} ${operation} --input ${inputPath}`);
      lines.push("```", "");
      lines.push("Payload example:", "");
      lines.push("```json");
      lines.push(renderPayloadExample(operation));
      lines.push("```", "");
    } else {
      lines.push("Run:", "");
      lines.push("```bash");
      lines.push(`${skillCallCommand} ${operation}`);
      lines.push("```", "");
    }
  }
  return lines.join("\n");
}

function renderPayloadExample(operation) {
  switch (operation) {
    case "project.upsert":
      return JSON.stringify({ title: "Todo App", description: "A focused app for tracking personal tasks." }, null, 2);
    case "milestone.create":
      return JSON.stringify({ title: "v1.0 Todo App MVP", goal: "Deliver persistent task creation, completion, editing, and deletion." }, null, 2);
    case "milestone.complete":
      return JSON.stringify({ milestoneId: "M001", summary: "The milestone shipped and passed verification." }, null, 2);
    case "slice.list":
      return JSON.stringify({ milestoneId: "M001" }, null, 2);
    case "slice.create":
      return JSON.stringify({ milestoneId: "M001", title: "Task persistence", goal: "Persist tasks across app reloads.", order: 1 }, null, 2);
    case "slice.updateStatus":
      return JSON.stringify({ sliceId: "S001", status: "in_progress" }, null, 2);
    case "task.list":
      return JSON.stringify({ sliceId: "S001" }, null, 2);
    case "task.create":
      return JSON.stringify({ sliceId: "S001", title: "Add task model", description: "Implement the task persistence model and tests." }, null, 2);
    case "task.updateStatus":
      return JSON.stringify({ taskId: "T001", status: "done", verificationState: "verified" }, null, 2);
    case "artifact.list":
      return JSON.stringify({ scopeType: "milestone", scopeId: "M001" }, null, 2);
    case "artifact.read":
      return JSON.stringify({ scopeType: "milestone", scopeId: "M001", artifactType: "requirements" }, null, 2);
    case "artifact.write":
      return JSON.stringify({
        scopeType: "milestone",
        scopeId: "M001",
        artifactType: "requirements",
        title: "M001 Requirements",
        content: "# Requirements\n\n- [ ] **TODO-01**: User can create a task.",
        format: "markdown",
      }, null, 2);
    default:
      return "{}";
  }
}

function renderSkillMarkdown(skill) {
  const extraReferences = skill.requiredReferences
    .filter((reference) => !["alignment", "cli-runtime", "artifact-contract"].includes(reference))
    .map((reference) => `- ${reference}: \`references/${reference}.md\``);
  const templates = skill.requiredTemplates.map((template) => `- ${template}: \`templates/${template}.md\``);
  const operatingBrief = Array.isArray(skill.operatingBrief) && skill.operatingBrief.length > 0
    ? [
        "## Operating Brief",
        "",
        ...skill.operatingBrief.map((line) => (line.trim().length === 0 ? "" : line)),
        "",
      ]
    : [];
  const successCriteria = Array.isArray(skill.successCriteria) && skill.successCriteria.length > 0
    ? [
        "## Success Criteria",
        "",
        ...skill.successCriteria.map((criterion) => `- ${criterion}`),
        "",
      ]
    : [];
  const doNot = Array.isArray(skill.doNot) && skill.doNot.length > 0
    ? [
        "## Do Not",
        "",
        ...skill.doNot.map((rule) => `- ${rule}`),
        "",
      ]
    : [];
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    ...operatingBrief,
    ...successCriteria,
    ...doNot,
    "## Process",
    "",
    "1. Read `references/workflow.md` before taking action. Execute that workflow end-to-end.",
    "2. Preserve every workflow gate: required checks, user confirmations, durable writes, status updates, and next-step routing.",
    "3. Before any backend IO, read `references/runtime-contract.md` and use only the operations listed there.",
    "4. When the workflow tells you to create or read an artifact, use `references/artifact-contract.md` and the named template files.",
    "5. If setup or backend readiness is uncertain, read `references/setup.md` before proceeding.",
    "6. Read optional references only when the workflow calls for them or the current step needs them.",
    "",
    "## Resource Loading",
    "",
    "Must read:",
    "",
    "- Workflow: `references/workflow.md`",
    "- Runtime IO contract: `references/runtime-contract.md`",
    "",
    "Read when needed:",
    "",
    "- Setup and health checks: `references/setup.md`",
    "- Alignment depth: `references/alignment.md`",
    "- CLI command patterns: `references/cli-runtime.md`",
    "- Artifact conventions: `references/artifact-contract.md`",
    "- CLI helper: `scripts/kata-call.mjs`",
    ...(extraReferences.length > 0 ? ["", "Additional references:", "", ...extraReferences] : []),
    ...(templates.length > 0 ? ["", "Templates:", "", ...templates] : []),
    "",
    "## Execution Rules",
    "",
    "1. If setup or backend state is uncertain, start with `references/setup.md`.",
    "2. Choose alignment depth using `references/alignment.md` inside this workflow.",
    "3. Follow `references/workflow.md` as the behavioral source for this skill.",
    "4. Use only operations listed in `references/runtime-contract.md` for backend IO.",
    "5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.",
    "",
  ].join("\n");
}

function renderSetupReference(skill) {
  return [
    "# Setup and Health",
    "",
    skill.setupHint,
    "",
    "When this skill is already installed, prefer the local wrapper:",
    "",
    `- \`${skillCallCommand} doctor\``,
    `- \`${skillCallCommand} health.check\``,
    "",
    "## GitHub Projects V2 Setup",
    "",
    "`setup --pi` installs or refreshes local Pi skills. It does not create or repair GitHub Project fields.",
    "",
    "If a backend operation reports missing GitHub Projects v2 fields, stop and instruct the user to add these exact Project fields before retrying:",
    "",
    "- `Kata Type` — Text field",
    "- `Kata ID` — Text field",
    "- `Kata Parent ID` — Text field",
    "- `Kata Artifact Scope` — Text field",
    "- `Kata Verification State` — Text field",
    "- `Kata Blocking` — Text field with comma-separated Kata IDs",
    "- `Kata Blocked By` — Text field with comma-separated Kata IDs",
    "",
    "The Project `Status` field must include these options:",
    "",
    "- `Backlog`",
    "- `Todo`",
    "- `In Progress`",
    "- `Agent Review`",
    "- `Human Review`",
    "- `Merging`",
    "- `Done`",
    "",
    "In GitHub Project table view, add a text field from the rightmost field header: click `+`, choose `New field`, enter the exact name, choose `Text`, and save.",
    "",
    "Do not retry the failed backend write until the Project fields are fixed.",
    "",
  ].join("\n");
}

function renderRuntimeContractReference(skill) {
  return [
    "# Runtime Contract",
    "",
    renderContractOperations(skill),
    "",
    "Use `<path-to-skill-directory>/scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.",
    "",
  ].join("\n");
}

function renderWorkflowReference(skill, workflowBody) {
  return [
    "# Workflow Reference",
    "",
    workflowBody.trim(),
    "",
  ].join("\n");
}

async function copyIfExists(source, destination) {
  if (!(await pathExists(source))) return;
  if (source.endsWith(".md")) {
    const markdown = await fs.readFile(source, "utf8");
    await fs.writeFile(destination, normalizeSkillCommandReferences(markdown), "utf8");
    return;
  }
  await fs.cp(source, destination, { recursive: true });
}

const manifestPath = path.join(sourceRoot, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
await validateManifest(manifest);

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });

for (const skill of manifest.skills) {
  const workflowPath = path.join(sourceRoot, "workflows", `${skill.workflow}.md`);
  const workflowBody = normalizeSkillCommandReferences(await fs.readFile(workflowPath, "utf8"));
  const skillDir = path.join(targetDir, skill.name);
  const referencesDir = path.join(skillDir, "references");
  const templatesDir = path.join(skillDir, "templates");

  await fs.mkdir(referencesDir, { recursive: true });
  if (skill.requiredTemplates.length > 0) {
    await fs.mkdir(templatesDir, { recursive: true });
  }
  await fs.writeFile(path.join(skillDir, "SKILL.md"), renderSkillMarkdown(skill), "utf8");
  await fs.writeFile(path.join(referencesDir, "setup.md"), renderSetupReference(skill), "utf8");
  await fs.writeFile(path.join(referencesDir, "runtime-contract.md"), renderRuntimeContractReference(skill), "utf8");
  await fs.writeFile(path.join(referencesDir, "workflow.md"), renderWorkflowReference(skill, workflowBody), "utf8");
  await copyIfExists(path.join(sourceRoot, "references", "alignment.md"), path.join(referencesDir, "alignment.md"));
  await copyIfExists(path.join(sourceRoot, "references", "cli-runtime.md"), path.join(referencesDir, "cli-runtime.md"));
  await copyIfExists(path.join(sourceRoot, "references", "artifact-contract.md"), path.join(referencesDir, "artifact-contract.md"));
  for (const reference of skill.requiredReferences) {
    await copyIfExists(path.join(sourceRoot, "references", `${reference}.md`), path.join(referencesDir, `${reference}.md`));
  }
  for (const template of skill.requiredTemplates) {
    await copyIfExists(path.join(sourceRoot, "templates", `${template}.md`), path.join(templatesDir, `${template}.md`));
  }
  await copyIfExists(path.join(sourceRoot, "scripts"), path.join(skillDir, "scripts"));
}
