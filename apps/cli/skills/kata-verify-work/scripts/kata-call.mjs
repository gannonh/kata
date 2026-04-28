#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const localLoader = process.env.KATA_CLI_ROOT
  ? path.join(process.env.KATA_CLI_ROOT, "dist", "loader.js")
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
