#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseDotEnvValue(rawValue) {
  if (rawValue.length >= 2) {
    const quote = rawValue[0];
    if ((quote === `"` || quote === `'`) && rawValue[rawValue.length - 1] === quote) {
      const inner = rawValue.slice(1, -1);
      return quote === `"` ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t") : inner;
    }
  }

  const commentIndex = rawValue.search(/\s#/);
  return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}

function loadDotEnv(cwd) {
  const envPath = path.join(cwd, ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    process.env[key] = parseDotEnvValue(line.slice(separatorIndex + 1).trim());
  }
}

loadDotEnv(process.cwd());

const localLoader = process.env.KATA_CLI_ROOT
  ? path.join(path.resolve(process.cwd(), process.env.KATA_CLI_ROOT), "dist", "loader.js")
  : null;

const command = localLoader && existsSync(localLoader) ? process.execPath : "npx";
const args = localLoader && existsSync(localLoader)
  ? [localLoader, "call", ...process.argv.slice(2)]
  : ["--yes", "@kata-sh/cli", "call", ...process.argv.slice(2)];

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (status) => {
  process.exit(status ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
