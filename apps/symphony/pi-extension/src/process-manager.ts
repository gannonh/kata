import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SymphonyExtensionError } from "./errors.ts";
import { SymphonyHttpClient } from "./http-client.ts";
import type { ExtensionState } from "./state.ts";

const TERMINATE_GRACE_MS = 2000;
const KILL_GRACE_MS = 2000;
const MAX_OUTPUT_CHARS = 64_000;

export interface StartOptions {
  binary: string;
  cwd: string;
  workflow?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StartResult {
  baseUrl: string;
  owned: true;
  pid: number;
}

export class SymphonyProcessManager {
  private child?: ChildProcessWithoutNullStreams;
  private output = "";

  constructor(private readonly state: ExtensionState) {}

  async start(options: StartOptions): Promise<StartResult> {
    throwIfAborted(options.signal);

    if (this.child) {
      if (isChildRunning(this.child)) {
        throw new SymphonyExtensionError("command_failed", "Symphony is already running as an owned child process", {
          pid: this.child.pid,
        });
      }
      this.clearOwnedState();
    }

    const args = options.workflow ? [options.workflow, "--no-tui"] : ["--no-tui"];
    this.output = "";
    const child = spawn(options.binary, args, { cwd: options.cwd, stdio: "pipe" });
    this.child = child;
    child.once("exit", () => {
      if (this.child === child) this.clearOwnedState();
    });

    const pid = child.pid;
    if (!pid) {
      this.clearOwnedState();
      throw new SymphonyExtensionError("command_failed", "Failed to spawn Symphony process");
    }

    child.stdout.on("data", (chunk) => this.appendOutput(chunk));
    child.stderr.on("data", (chunk) => this.appendOutput(chunk));

    try {
      const baseUrl = await this.waitForReady(options.cwd, options.workflow, options.timeoutMs ?? 10_000, options.signal);
      throwIfAborted(options.signal);
      this.state.ownedProcess = {
        pid,
        command: [options.binary, ...args].join(" "),
        cwd: options.cwd,
        baseUrl,
        startedAt: new Date().toISOString(),
      };
      if (!isChildRunning(child)) this.clearOwnedState();

      return { baseUrl, owned: true, pid };
    } catch (error) {
      try {
        await this.stopOwnedInternal(false);
      } catch {
        this.clearOwnedState();
      }
      throw error;
    }
  }

  async stopOwned(): Promise<void> {
    await this.stopOwnedInternal(true);
  }

  async shutdown(): Promise<void> {
    if (!this.state.stopOwnedOnShutdown) return;
    await this.stopOwnedInternal(false);
  }

  private async stopOwnedInternal(throwIfNotOwned: boolean): Promise<void> {
    if (!this.child || !isChildRunning(this.child)) {
      this.clearOwnedState();
      if (throwIfNotOwned) {
        throw new SymphonyExtensionError("not_owned", "No Symphony process owned by this extension is running");
      }
      return;
    }

    const child = this.child;
    child.kill("SIGTERM");
    await waitForExitOrTimeout(child, TERMINATE_GRACE_MS);

    if (isChildRunning(child)) {
      child.kill("SIGKILL");
      await waitForExitOrTimeout(child, KILL_GRACE_MS);
    }

    this.clearOwnedState();
  }

  private clearOwnedState(): void {
    const ownedBaseUrl = this.state.ownedProcess?.baseUrl;
    this.child = undefined;
    this.state.ownedProcess = undefined;
    if (ownedBaseUrl && this.state.attachedBaseUrl === ownedBaseUrl) {
      this.state.attachedBaseUrl = undefined;
      this.state.lastKnownState = undefined;
    }
  }

  private appendOutput(chunk: unknown): void {
    this.output = (this.output + String(chunk)).slice(-MAX_OUTPUT_CHARS);
  }

  private async waitForReady(cwd: string, workflow: string | undefined, timeoutMs: number, signal?: AbortSignal): Promise<string> {
    const started = Date.now();
    let lastError: unknown;

    while (Date.now() - started < timeoutMs) {
      throwIfAborted(signal);
      const baseUrl = this.detectOutputBaseUrl() ?? (Date.now() - started >= Math.min(500, timeoutMs) ? this.detectBaseUrl(cwd, workflow) : undefined);
      if (baseUrl) {
        try {
          const client = new SymphonyHttpClient(baseUrl);
          await client.verify(signal);
          return baseUrl;
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = error;
        }
      }

      if (this.child && !isChildRunning(this.child)) break;
      await delay(150, signal);
    }

    throw new SymphonyExtensionError("start_timeout", "Timed out waiting for Symphony HTTP API", {
      expectedBaseUrl: this.detectBaseUrl(cwd, workflow),
      output: this.output.slice(-4000),
      childExitCode: this.child?.exitCode,
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }

  private detectBaseUrl(cwd: string, workflow: string | undefined): string {
    const outputBaseUrl = this.detectOutputBaseUrl();
    if (outputBaseUrl) return outputBaseUrl;

    const workflowPath = workflow ? resolve(cwd, workflow) : join(cwd, ".symphony", "WORKFLOW.md");
    const configured = readWorkflowServerConfigSyncBestEffort(workflowPath);
    return `http://${configured.host}:${configured.port}`;
  }

  private detectOutputBaseUrl(): string | undefined {
    return this.output.match(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+/)?.[0];
  }
}

function isChildRunning(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("This operation was aborted", "AbortError");
}

async function delay(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("This operation was aborted", "AbortError"));
    };
    const timeout = setTimeout(done, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function waitForExitOrTimeout(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (!isChildRunning(child)) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("exit", done);
      resolve();
    };
    const timeout = setTimeout(done, timeoutMs);
    child.once("exit", done);
    if (!isChildRunning(child)) done();
  });
}

function readWorkflowServerConfigSyncBestEffort(workflowPath: string): { host: string; port: number } {
  try {
    return parseWorkflowServerConfig(readFileSync(workflowPath, "utf8"));
  } catch {
    return { host: "127.0.0.1", port: 8080 };
  }
}

function parseWorkflowServerConfig(content: string): { host: string; port: number } {
  const yaml = extractYamlFrontmatter(content) ?? content;
  let inServerSection = false;
  let serverIndent = -1;
  let host = "127.0.0.1";
  let port = 8080;

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = stripYamlComment(rawLine).trimEnd();
    if (!line.trim()) continue;
    const indent = leadingWhitespaceLength(line);
    const trimmed = line.trim();

    if (trimmed === "server:") {
      inServerSection = true;
      serverIndent = indent;
      continue;
    }

    if (inServerSection && indent <= serverIndent) {
      inServerSection = false;
    }

    if (!inServerSection) continue;

    const match = trimmed.match(/^(host|port):\s*(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = parseYamlScalar(rawValue);
    if (key === "host" && value) host = value;
    if (key === "port") {
      const parsedPort = Number(value);
      if (Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535) port = parsedPort;
    }
  }

  return { host, port };
}

function extractYamlFrontmatter(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return undefined;
  return lines.slice(1, end).join("\n");
}

function stripYamlComment(line: string): string {
  return line.replace(/\s+#.*$/, "");
}

function leadingWhitespaceLength(value: string): number {
  return value.length - value.trimStart().length;
}

function parseYamlScalar(value: string): string {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : trimmed;
}
