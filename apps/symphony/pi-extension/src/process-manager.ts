import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join, resolve } from "node:path";
import { SymphonyExtensionError } from "./errors.ts";
import { SymphonyHttpClient } from "./http-client.ts";
import type { ExtensionState } from "./state.ts";

const TERMINATE_GRACE_MS = 2000;
const KILL_GRACE_MS = 2000;

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
    this.child = spawn(options.binary, args, { cwd: options.cwd, stdio: "pipe" });
    const pid = this.child.pid;
    if (!pid) throw new SymphonyExtensionError("command_failed", "Failed to spawn Symphony process");

    this.child.stdout.on("data", (chunk) => (this.output += String(chunk)));
    this.child.stderr.on("data", (chunk) => (this.output += String(chunk)));

    try {
      const baseUrl = await this.waitForReady(options.cwd, options.workflow, options.timeoutMs ?? 10_000, options.signal);
      throwIfAborted(options.signal);
      this.state.attachedBaseUrl = baseUrl;
      this.state.ownedProcess = {
        pid,
        command: [options.binary, ...args].join(" "),
        cwd: options.cwd,
        baseUrl,
        startedAt: new Date().toISOString(),
      };

      return { baseUrl, owned: true, pid };
    } catch (error) {
      if (options.signal?.aborted) {
        await this.stopOwnedInternal(false);
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
    this.child = undefined;
    this.state.ownedProcess = undefined;
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
    return this.output.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/)?.[0];
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

function readWorkflowServerConfigSyncBestEffort(_workflowPath: string): { host: string; port: number } {
  return { host: "127.0.0.1", port: 8080 };
}
