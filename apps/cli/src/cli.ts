import { readFile } from "node:fs/promises";

import { createKataDomainApi } from "./domain/service.js";
import { resolveBackend } from "./backends/resolve-backend.js";
import { runSetup } from "./commands/setup.js";
import { runDoctor } from "./commands/doctor.js";
import { jsonResultIndicatesFailure } from "./commands/json-result.js";
import { loadDotEnv } from "./env.js";
import { isSupportedJsonOperation, runJsonCommand } from "./transports/json.js";

function writeJsonError(message: string) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: "INVALID_REQUEST", message } })}\n`);
  process.exitCode = 1;
}

function writeJsonResult(result: string) {
  process.stdout.write(`${result}\n`);
  if (jsonResultIndicatesFailure(result)) {
    process.exitCode = 1;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRuntimeError(error: unknown): { code: string; message: string } {
  if (isRecord(error)) {
    const code = typeof error.code === "string" && error.code.trim().length > 0 ? error.code : "UNKNOWN";
    const message = typeof error.message === "string" && error.message.trim().length > 0
      ? error.message
      : "Unexpected error while processing JSON command.";
    return { code, message };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN",
      message: error.message || "Unexpected error while processing JSON command.",
    };
  }

  return {
    code: "UNKNOWN",
    message: "Unexpected error while processing JSON command.",
  };
}

let cachedPackageVersion: string | null = null;

async function getPackageVersion(): Promise<string> {
  if (cachedPackageVersion) return cachedPackageVersion;

  try {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const content = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(content) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      cachedPackageVersion = parsed.version.trim();
      return cachedPackageVersion;
    }
  } catch {
    // Fall through to default version.
  }

  cachedPackageVersion = "0.0.0-dev";
  return cachedPackageVersion;
}

async function main(argv = process.argv.slice(2)) {
  loadDotEnv({ cwd: process.cwd(), env: process.env });

  const [command, ...rest] = argv;
  const packageVersion = await getPackageVersion();

  if (command === "setup") {
    const setupForPi = rest.includes("--pi");
    const result = await runSetup({
      pi: setupForPi,
      env: process.env,
      packageVersion,
    });

    if (!setupForPi && result.ok) {
      process.stdout.write(`${JSON.stringify({ ok: true, harness: result.harness })}\n`);
      return;
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "doctor") {
    const report = await runDoctor({
      cwd: process.cwd(),
      env: process.env,
      packageVersion,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (command === "call") {
    const operation = rest[0];
    const inputFlagIndex = rest.findIndex((value) => value === "--input");
    const inputPath = inputFlagIndex >= 0 ? rest[inputFlagIndex + 1] : undefined;
    if (!operation) {
      writeJsonError("Missing operation. Usage: kata call <operation> --input <request.json>");
      return;
    }

    if (inputFlagIndex >= 0 && (!inputPath || inputPath.startsWith("--"))) {
      writeJsonError("Missing input path. Usage: kata call <operation> --input <request.json>");
      return;
    }

    try {
      const { runCall } = await import("./commands/call.js");
      writeJsonResult(await runCall({ operation, inputPath, cwd: process.cwd() }));
    } catch (error) {
      writeJsonResult(JSON.stringify({ ok: false, error: toJsonRuntimeError(error) }));
    }
    return;
  }

  if (command === "json") {
    const requestPath = rest[0];
    if (!requestPath) {
      writeJsonError("Missing request path. Usage: kata json <request.json>");
      return;
    }

    let requestContent = "";
    try {
      requestContent = await readFile(requestPath, "utf8");
    } catch {
      writeJsonError(`Unable to read request file: ${requestPath}`);
      return;
    }

    let parsedRequest: unknown;
    try {
      parsedRequest = JSON.parse(requestContent);
    } catch {
      writeJsonError("Request file must contain valid JSON.");
      return;
    }

    if (!isRecord(parsedRequest)) {
      writeJsonError("JSON request must be an object.");
      return;
    }

    const operation = parsedRequest.operation;
    if (typeof operation !== "string" || operation.trim().length === 0) {
      writeJsonError("JSON request must include a non-empty string operation.");
      return;
    }

    const hasPayload = Object.prototype.hasOwnProperty.call(parsedRequest, "payload");
    const payloadValue = parsedRequest.payload;
    if (hasPayload && !isRecord(payloadValue)) {
      writeJsonError("JSON request payload must be an object when provided.");
      return;
    }

    const payload: Record<string, unknown> | undefined = hasPayload
      ? (payloadValue as Record<string, unknown>)
      : undefined;
    const request = { operation: operation.trim(), ...(payload ? { payload } : {}) };

    if (!isSupportedJsonOperation(request.operation)) {
      process.stdout.write(`${JSON.stringify({
        ok: false,
        error: { code: "UNKNOWN", message: `Unsupported operation: ${request.operation}` },
      })}\n`);
      process.exitCode = 1;
      return;
    }

    try {
      const adapter = await resolveBackend({ workspacePath: process.cwd() });
      writeJsonResult(await runJsonCommand(request, createKataDomainApi(adapter)));
    } catch (error) {
      writeJsonResult(JSON.stringify({ ok: false, error: toJsonRuntimeError(error) }));
    }
    return;
  }

  process.stdout.write([
    "Usage:",
    "  kata setup",
    "  kata doctor",
    "  kata call <operation> --input <request.json>",
    "  kata json <request.json>",
  ].join("\n") + "\n");
}

void main();
