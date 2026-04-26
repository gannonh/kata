const fs = require("fs/promises");
const path = require("path");

async function buildSkillBundle({ sourceRoot, outputDir }) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8"),
  );

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  for (const skill of manifest.skills) {
    const skillDir = path.join(outputDir, skill.name);
    await fs.mkdir(skillDir, { recursive: true });

    const body = [
      "---",
      `name: ${skill.name}`,
      `description: "${skill.description}"`,
      "---",
      "",
      `# ${skill.name}`,
      "",
      "Use `@kata-sh/cli setup` to bootstrap the CLI and harness integration when the environment is not prepared yet.",
      "",
      "Read the corresponding workflow source from `apps/orchestrator/kata/workflows/` and use the canonical Kata CLI domain operations rather than backend-specific logic.",
      "",
    ].join("\n");

    await fs.writeFile(path.join(skillDir, "SKILL.md"), body);
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
