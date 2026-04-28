import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const sourceDir = path.resolve(cliRoot, "..", "orchestrator", "dist", "skills");
const targetDir = path.resolve(cliRoot, "skills");

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await pathExists(sourceDir))) {
  throw new Error(
    `Missing skills bundle at ${sourceDir}. Run "pnpm --dir apps/orchestrator run build:skills" first.`,
  );
}

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });
await fs.cp(sourceDir, targetDir, { recursive: true });
