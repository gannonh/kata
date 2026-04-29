const fs = require("fs/promises");
const path = require("path");

const SUPPORTED_RUNTIME_OPERATIONS = new Set([
  "health.check",
  "project.upsert",
  "project.getContext",
  "milestone.create",
  "milestone.getActive",
  "milestone.complete",
  "slice.create",
  "slice.list",
  "task.create",
  "task.list",
  "task.updateStatus",
  "artifact.list",
  "artifact.read",
  "artifact.write",
  "execution.getStatus",
]);

const CORE_SKILL_WORKFLOW_MAP = {
  "kata-setup": "setup",
  "kata-new-project": "new-project",
  "kata-new-milestone": "new-milestone",
  "kata-plan-phase": "plan-phase",
  "kata-execute-phase": "execute-phase",
  "kata-verify-work": "verify-work",
  "kata-complete-milestone": "complete-milestone",
  "kata-progress": "progress",
  "kata-health": "health",
};

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_DESCRIPTION_LENGTH = 1024;

function requireNonEmptyString(value, fieldName, skillName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Skill "${skillName}" is missing required "${fieldName}" string.`);
  }
}

function validateSkillName(name) {
  if (name.length < 1 || name.length > 64) {
    throw new Error(`Skill "${name}" has invalid length. Expected 1-64 characters.`);
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      `Skill "${name}" has invalid name format. Use lowercase letters, numbers, and single hyphens only.`,
    );
  }
}

async function validateSkill(skill, sourceRoot) {
  requireNonEmptyString(skill.name, "name", "<unknown>");
  requireNonEmptyString(skill.description, "description", skill.name);
  requireNonEmptyString(skill.workflow, "workflow", skill.name);
  requireNonEmptyString(skill.setupHint, "setupHint", skill.name);
  validateSkillName(skill.name);

  if (skill.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Skill "${skill.name}" description exceeds ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  if (!skill.setupHint.includes("@kata-sh/cli setup")) {
    throw new Error(`Skill "${skill.name}" setupHint must reference @kata-sh/cli setup.`);
  }

  const workflowPath = path.join(sourceRoot, "skills-src", "workflows", `${skill.workflow}.md`);
  try {
    await fs.access(workflowPath);
  } catch {
    throw new Error(`Skill "${skill.name}" points to missing workflow: ${workflowPath}`);
  }

  const runtimeRequired = skill.runtimeRequired !== false;
  if (!Array.isArray(skill.contractOperations)) {
    throw new Error(`Skill "${skill.name}" must declare contractOperations as an array.`);
  }

  if (runtimeRequired && skill.contractOperations.length === 0) {
    throw new Error(`Skill "${skill.name}" must declare contractOperations when runtimeRequired is true.`);
  }

  const seenOps = new Set();
  for (const op of skill.contractOperations) {
    if (typeof op !== "string" || op.trim().length === 0) {
      throw new Error(`Skill "${skill.name}" has a non-string contract operation.`);
    }
    if (!SUPPORTED_RUNTIME_OPERATIONS.has(op)) {
      throw new Error(`Skill "${skill.name}" declares unsupported contract operation: ${op}`);
    }
    if (seenOps.has(op)) {
      throw new Error(`Skill "${skill.name}" declares duplicate contract operation: ${op}`);
    }
    seenOps.add(op);
  }
}

async function validateManifest(manifest, sourceRoot) {
  if (!manifest || !Array.isArray(manifest.skills)) {
    throw new Error("skills-src/manifest.json must contain a top-level skills array.");
  }

  const seenNames = new Set();
  for (const skill of manifest.skills) {
    await validateSkill(skill, sourceRoot);
    if (seenNames.has(skill.name)) {
      throw new Error(`Duplicate skill name in manifest: ${skill.name}`);
    }
    seenNames.add(skill.name);
  }

  for (const [skillName, workflowName] of Object.entries(CORE_SKILL_WORKFLOW_MAP)) {
    const skill = manifest.skills.find((entry) => entry.name === skillName);
    if (!skill) {
      throw new Error(`Missing required core skill mapping: ${skillName}`);
    }
    if (skill.workflow !== workflowName) {
      throw new Error(
        `Core skill "${skillName}" must map to workflow "${workflowName}" (found "${skill.workflow}").`,
      );
    }
  }
}

function renderContractOperationsSection(skill) {
  const runtimeRequired = skill.runtimeRequired !== false;
  if (!runtimeRequired) {
    return [
      "This is a setup-oriented skill. Runtime state is not required before setup.",
      "",
      "When checking runtime health, use only these typed operations:",
      "",
      ...skill.contractOperations.map((operation) => `- \`${operation}\``),
    ].join("\n");
  }

  return [
    "Use only these typed runtime operations:",
    "",
    ...skill.contractOperations.map((operation) => `- \`${operation}\``),
  ].join("\n");
}

function renderSkillMarkdown(skill) {
  const compatibility = "Requires an Agent Skills-compatible harness with @kata-sh/cli available.";
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    `compatibility: ${JSON.stringify(compatibility)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    "Use progressive disclosure resources:",
    "",
    "- Setup and health checks: `references/setup.md`",
    "- Canonical workflow instructions: `references/workflow.md`",
    "- Runtime IO contract: `references/runtime-contract.md`",
    "- Alignment pattern: `references/alignment.md`",
    "- CLI call helper: `scripts/kata-call.mjs`",
    "",
    "## Execution Rules",
    "",
    "1. If runtime setup is uncertain, start with `references/setup.md`.",
    "2. Follow `references/workflow.md` as the behavioral source for this skill.",
    "3. For backend IO, use only operations listed in `references/runtime-contract.md`.",
    "4. Keep workflow alignment inside the active workflow using `references/alignment.md`.",
    "5. Keep backend specifics in CLI adapters; keep skill instructions harness-agnostic.",
    "",
    "## Guardrails",
    "",
    "- Do not invent contract operations not declared in `references/runtime-contract.md`.",
    "- Do not bypass @kata-sh/cli typed runtime APIs for backend state.",
    "- Do not create standalone discuss workflows; persist durable decisions through artifacts.",
    "- Prefer concise orchestration in `SKILL.md` and detailed instructions in references.",
    "",
  ].join("\n");
}

function renderSetupReference(skill) {
  return [
    "# Setup and Health",
    "",
    "Run this setup guidance before workflow execution when needed:",
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
    renderContractOperationsSection(skill),
    "",
    "Guardrails:",
    "",
    "- Use only typed operations from @kata-sh/cli.",
    "- Keep backend behavior behind adapter boundaries.",
    "",
  ].join("\n");
}

function renderWorkflowReference(skill, workflowBody) {
  return [
    "# Workflow Reference",
    "",
    `Source: \`apps/orchestrator/skills-src/workflows/${skill.workflow}.md\``,
    "",
    workflowBody.trim(),
    "",
  ].join("\n");
}

async function buildSkillBundle({ sourceRoot, outputDir }) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8"),
  );
  await validateManifest(manifest, sourceRoot);

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const alignmentSource = path.join(sourceRoot, "skills-src", "references", "alignment.md");
  const scriptsSource = path.join(sourceRoot, "skills-src", "scripts");

  for (const skill of manifest.skills) {
    const workflowPath = path.join(sourceRoot, "skills-src", "workflows", `${skill.workflow}.md`);
    const workflowBody = await fs.readFile(workflowPath, "utf8");
    const skillDir = path.join(outputDir, skill.name);
    const referencesDir = path.join(skillDir, "references");
    const scriptsDir = path.join(skillDir, "scripts");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.mkdir(referencesDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), renderSkillMarkdown(skill));
    await fs.writeFile(path.join(referencesDir, "setup.md"), renderSetupReference(skill));
    await fs.writeFile(path.join(referencesDir, "runtime-contract.md"), renderRuntimeContractReference(skill));
    await fs.writeFile(path.join(referencesDir, "workflow.md"), renderWorkflowReference(skill, workflowBody));
    await fs.copyFile(alignmentSource, path.join(referencesDir, "alignment.md"));
    await fs.cp(scriptsSource, scriptsDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const sourceRoot = path.resolve(__dirname, "..");
  const outputDir = path.join(sourceRoot, "dist", "skills");

  buildSkillBundle({ sourceRoot, outputDir }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildSkillBundle };
