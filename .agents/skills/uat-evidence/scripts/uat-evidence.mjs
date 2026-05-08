#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SCRIPT_DIR = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const RUNNERS = {
  "kata-cli": path.join(SCRIPT_DIR, "kata-cli.mjs"),
  "symphony-runtime": path.join(SCRIPT_DIR, "symphony-runtime.mjs"),
};

main();

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args._[0] ?? "help";
  if (command === "help" || args.help) {
    printHelp();
    return;
  }

  const runtime = resolveRuntime(args);
  if (!runtime) {
    throwUsage("Specify --runtime kata-cli or --runtime symphony-runtime.");
  }

  const runner = RUNNERS[runtime];
  const forwarded = stripRuntimeArgs(argv);
  const result = spawnSync(process.execPath, [runner, ...forwarded], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

function printHelp() {
  console.log(`uat-evidence

Commands:
  test --runtime kata-cli|symphony-runtime --backend github|linear [runtime options]
  update --runtime kata-cli|symphony-runtime [runtime options]
  cleanup --runtime kata-cli|symphony-runtime --evidence /path/to/evidence.json
  cleanup --evidence /path/to/evidence.json  # runtime inferred when possible

Default output:
  <workspace>/uat-evidence/<runtime>-<backend>-<timestamp>-<pid>/

Runtime aliases:
  kata, cli -> kata-cli
  symphony, sym -> symphony-runtime

Examples:
  node .agents/skills/uat-evidence/scripts/uat-evidence.mjs test --runtime kata-cli --backend github
  node .agents/skills/uat-evidence/scripts/uat-evidence.mjs test --runtime symphony-runtime --backend linear
`);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }
    const stripped = arg.slice(2);
    const eqIndex = stripped.indexOf("=");
    const rawKey = eqIndex === -1 ? stripped : stripped.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : stripped.slice(eqIndex + 1);
    const key = rawKey.replaceAll("-", "_");
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      result[key] = argv[index + 1];
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function resolveRuntime(args) {
  const explicit = normalizeRuntime(args.runtime ?? args.target);
  if (explicit) return explicit;
  const evidencePath = args.evidence ? path.resolve(String(args.evidence)) : null;
  if (!evidencePath || !existsSync(evidencePath)) return null;
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const runtime = normalizeRuntime(evidence.runtime);
  if (runtime) return runtime;
  if (evidence.cliRoot || evidence.cliVersion) return "kata-cli";
  if (evidence.symphonyRoot || evidence.helperContractSource) return "symphony-runtime";
  return null;
}

function normalizeRuntime(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["kata", "cli", "kata-cli", "kata_cli"].includes(raw)) return "kata-cli";
  if (["symphony", "sym", "symphony-runtime", "symphony_runtime"].includes(raw)) return "symphony-runtime";
  return null;
}

function stripRuntimeArgs(argv) {
  const output = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime" || arg === "--target") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--runtime=") || arg.startsWith("--target=")) continue;
    output.push(arg);
  }
  return output;
}

function throwUsage(message) {
  console.error(message);
  printHelp();
  process.exit(2);
}
