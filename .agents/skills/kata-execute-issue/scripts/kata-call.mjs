#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseDotEnvValue(rawValue) {
  if (rawValue.length >= 2) {
    const quote = rawValue[0];
    if ((quote === `"` || quote === `'`) && rawValue[rawValue.length - 1] === quote) {
      const inner = rawValue.slice(1, -1);
      return quote === `"` ? decodeDoubleQuotedDotEnvValue(inner) : inner;
    }
  }

  const commentIndex = rawValue.search(/\s#/);
  return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}

function decodeDoubleQuotedDotEnvValue(value) {
  const escapes = new Map([
    ["n", "\n"],
    ["r", "\r"],
    ["t", "\t"],
    [`"`, `"`],
    ["\\", "\\"],
  ]);
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\" || index === value.length - 1) {
      decoded += char;
      continue;
    }
    const next = value[index + 1];
    decoded += escapes.get(next) ?? `\\${next}`;
    index += 1;
  }
  return decoded;
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

const rawCliCommands = new Set([
  "doctor",
  "setup",
  "json",
  "help",
  "--help",
  "-h",
  "--version",
  "-v",
]);

const localLoader = process.env.KATA_CLI_ROOT
  ? path.join(path.resolve(process.cwd(), process.env.KATA_CLI_ROOT), "dist", "loader.js")
  : null;

const userArgs = process.argv.slice(2);
const firstArg = userArgs[0] ?? "help";
const isRawCliCommand = rawCliCommands.has(firstArg);
const normalizedUserArgs = userArgs.length > 0 ? userArgs : ["help"];
const cliArgs = isRawCliCommand ? normalizedUserArgs : ["call", ...normalizedUserArgs];

let command;
let args;

if (localLoader && existsSync(localLoader)) {
  command = process.execPath;
  args = [localLoader, ...cliArgs];
} else if (process.env.KATA_CLI_BIN) {
  command = process.env.KATA_CLI_BIN;
  args = cliArgs;
} else {
  command = "npx";
  args = ["--yes", "@kata-sh/cli", ...cliArgs];
}

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
