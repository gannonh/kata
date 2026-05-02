#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

function usage() {
  return [
    "Usage:",
    "  node scripts/kata-artifact-input.mjs --scope-type task --scope-id T001 \\",
    "    --artifact-type verification --title \"T001 Verification\" \\",
    "    --content-file /tmp/T001-verification.md --output /tmp/kata-T001-verification.json",
  ].join("\n");
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${key}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) {
    throw new Error(`Missing required --${name}`);
  }
  return value;
}

try {
  const values = parseArgs(process.argv.slice(2));
  const contentFile = required(values, "content-file");
  const output = required(values, "output");

  const payload = {
    scopeType: required(values, "scope-type"),
    scopeId: required(values, "scope-id"),
    artifactType: required(values, "artifact-type"),
    title: required(values, "title"),
    content: readFileSync(contentFile, "utf8"),
    format: values.get("format") ?? "markdown",
  };

  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(usage());
  process.exit(1);
}
