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

    for (const operation of skill.contractOperations) {
      if (!supportedOperations.has(operation)) {
        throw new Error(`Skill "${skill.name}" declares unsupported contract operation: ${operation}`);
      }
    }

    const workflowPath = path.join(sourceRoot, "workflows", `${skill.workflow}.md`);
    if (!(await pathExists(workflowPath))) {
      throw new Error(`Skill "${skill.name}" points to missing workflow: ${workflowPath}`);
    }
  }
}

function renderContractOperations(skill) {
  if (skill.runtimeRequired === false && skill.contractOperations.length === 0) {
    return "This setup skill does not require runtime contract operations.";
  }

  return [
    "Use only these typed runtime operations:",
    "",
    ...skill.contractOperations.map((operation) => `- \`${operation}\``),
  ].join("\n");
}

function renderSkillMarkdown(skill) {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    "Use progressive disclosure resources:",
    "",
    "- Setup and health checks: `references/setup.md`",
    "- Alignment depth: `references/alignment.md`",
    "- Workflow instructions: `references/workflow.md`",
    "- Runtime IO contract: `references/runtime-contract.md`",
    "- CLI helper: `scripts/kata-call.mjs`",
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
    "Validate runtime health:",
    "",
    "- `npx @kata-sh/cli doctor`",
    "",
  ].join("\n");
}

function renderRuntimeContractReference(skill) {
  return [
    "# Runtime Contract",
    "",
    renderContractOperations(skill),
    "",
    "Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.",
    "",
  ].join("\n");
}

function renderWorkflowReference(skill, workflowBody) {
  return [
    "# Workflow Reference",
    "",
    `Source: \`apps/cli/skills-src/workflows/${skill.workflow}.md\``,
    "",
    workflowBody.trim(),
    "",
  ].join("\n");
}

async function copyIfExists(source, destination) {
  if (!(await pathExists(source))) return;
  await fs.cp(source, destination, { recursive: true });
}

const manifestPath = path.join(sourceRoot, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
await validateManifest(manifest);

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });

for (const skill of manifest.skills) {
  const workflowPath = path.join(sourceRoot, "workflows", `${skill.workflow}.md`);
  const workflowBody = await fs.readFile(workflowPath, "utf8");
  const skillDir = path.join(targetDir, skill.name);
  const referencesDir = path.join(skillDir, "references");

  await fs.mkdir(referencesDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), renderSkillMarkdown(skill), "utf8");
  await fs.writeFile(path.join(referencesDir, "setup.md"), renderSetupReference(skill), "utf8");
  await fs.writeFile(path.join(referencesDir, "runtime-contract.md"), renderRuntimeContractReference(skill), "utf8");
  await fs.writeFile(path.join(referencesDir, "workflow.md"), renderWorkflowReference(skill, workflowBody), "utf8");
  await copyIfExists(path.join(sourceRoot, "references", "alignment.md"), path.join(referencesDir, "alignment.md"));
  await copyIfExists(path.join(sourceRoot, "scripts"), path.join(skillDir, "scripts"));
}
