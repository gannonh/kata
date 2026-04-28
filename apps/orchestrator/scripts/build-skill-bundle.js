const fs = require("fs/promises");
const path = require("path");

const SUPPORTED_RUNTIME_OPERATIONS = new Set([
  "project.getContext",
  "milestone.getActive",
  "slice.list",
  "task.list",
  "artifact.list",
  "artifact.read",
  "artifact.write",
  "execution.getStatus",
]);

const CORE_SKILL_WORKFLOW_MAP = {
  "kata-new-project": "new-project",
  "kata-discuss-phase": "discuss-phase",
  "kata-plan-phase": "plan-phase",
  "kata-execute-phase": "execute-phase",
  "kata-verify-work": "verify-work",
  "kata-quick": "quick",
  "kata-progress": "progress",
  "kata-health": "health",
};

function requireNonEmptyString(value, fieldName, skillName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Skill "${skillName}" is missing required "${fieldName}" string.`);
  }
}

async function validateSkill(skill, sourceRoot) {
  requireNonEmptyString(skill.name, "name", "<unknown>");
  requireNonEmptyString(skill.description, "description", skill.name);
  requireNonEmptyString(skill.workflow, "workflow", skill.name);
  requireNonEmptyString(skill.setupHint, "setupHint", skill.name);

  if (!skill.setupHint.includes("@kata-sh/cli setup")) {
    throw new Error(`Skill "${skill.name}" setupHint must reference @kata-sh/cli setup.`);
  }

  const workflowPath = path.join(sourceRoot, "kata", "workflows", `${skill.workflow}.md`);
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
      "## Runtime Contract Operations",
      "",
      "None. This is a setup-only skill.",
      "",
    ];
  }

  return [
    "## Runtime Contract Operations",
    "",
    ...skill.contractOperations.map((operation) => `- \`${operation}\``),
    "",
  ];
}

function renderSkillMarkdown(skill) {
  const workflowPath = `apps/orchestrator/kata/workflows/${skill.workflow}.md`;
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    `workflow: ${skill.workflow}`,
    `runtime_required: ${skill.runtimeRequired === false ? "false" : "true"}`,
    "contract_operations:",
    ...(skill.contractOperations.length > 0
      ? skill.contractOperations.map((operation) => `  - ${operation}`)
      : ["  - none"]),
    "---",
    "",
    `# ${skill.name}`,
    "",
    "## Canonical Workflow",
    "",
    `- Source: \`${workflowPath}\``,
    "",
    "## Setup Hint",
    "",
    skill.setupHint,
    "",
    ...renderContractOperationsSection(skill),
    "## Guardrails",
    "",
    "- Use only the typed @kata-sh/cli runtime contract for backend IO.",
    "- Keep backend-specific behavior inside CLI adapters, never in skill logic.",
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

  for (const skill of manifest.skills) {
    const skillDir = path.join(outputDir, skill.name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), renderSkillMarkdown(skill));
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
