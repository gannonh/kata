import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { SymphonyProcessManager } from "./process-manager.ts";
import { createDefaultState } from "./state.ts";

let server: Server | undefined;

async function stateServer(): Promise<string> {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ running: {}, retry_queue: [], blocked: [], completed: [], polling: { checking: false, next_poll_in_ms: 0, poll_interval_ms: 30000 } }));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP address");
  return `http://127.0.0.1:${address.port}`;
}

async function writeNodeScript(dir: string, name: string, source: string): Promise<string> {
  const script = join(dir, name);
  await writeFile(script, source, "utf8");
  return script;
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  await expect.poll(() => isPidRunning(pid), { interval: 50, timeout: 3000 }).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
  server = undefined;
});

describe("SymphonyProcessManager", () => {
  it("starts Symphony with --no-tui and records owned process metadata", async () => {
    const baseUrl = await stateServer();
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-process-"));
    const script = join(dir, "fake-symphony.sh");
    await writeFile(script, `#!/bin/sh\necho "dashboard listening at ${baseUrl}"\nsleep 30\n`, "utf8");
    await chmod(script, 0o755);

    const state = createDefaultState();
    const manager = new SymphonyProcessManager(state);
    const started = await manager.start({ binary: script, cwd: dir, workflow: ".symphony/WORKFLOW.md", timeoutMs: 2000 });

    expect(started.baseUrl).toBe(baseUrl);
    expect(started.owned).toBe(true);
    expect(state.ownedProcess?.command).toContain("--no-tui");
    expect(state.ownedProcess?.command).toContain(".symphony/WORKFLOW.md");

    await manager.stopOwned();
  });

  it("hard-kills a SIGTERM-ignoring owned child and clears state", async () => {
    const baseUrl = await stateServer();
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-process-"));
    const script = await writeNodeScript(
      dir,
      "ignore-term.js",
      `process.on("SIGTERM", () => {});\nconsole.log("dashboard listening at ${baseUrl}");\nsetInterval(() => {}, 1000);\n`,
    );

    const state = createDefaultState();
    const manager = new SymphonyProcessManager(state);
    const started = await manager.start({ binary: process.execPath, cwd: dir, workflow: script, timeoutMs: 2000 });

    await manager.stopOwned();

    expect(state.ownedProcess).toBeUndefined();
    await waitForProcessExit(started.pid);
  }, 10_000);

  it("cleans up a spawned child when startup is aborted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-process-"));
    const pidFile = join(dir, "child.pid");
    const script = await writeNodeScript(
      dir,
      "hang.js",
      `const { writeFileSync } = require("node:fs");\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`,
    );

    const state = createDefaultState();
    const manager = new SymphonyProcessManager(state);
    const controller = new AbortController();
    const start = manager.start({ binary: process.execPath, cwd: dir, workflow: script, timeoutMs: 5000, signal: controller.signal });

    await expect.poll(async () => readFile(pidFile, "utf8").catch(() => ""), { interval: 50, timeout: 1000 }).not.toBe("");
    const pid = Number(await readFile(pidFile, "utf8"));
    controller.abort(new Error("startup cancelled"));

    await expect(start).rejects.toThrow("startup cancelled");
    expect(state.ownedProcess).toBeUndefined();
    await waitForProcessExit(pid);
  }, 10_000);

  it("allows start after a previous owned child exits", async () => {
    const baseUrl = await stateServer();
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-process-"));
    const quickExit = await writeNodeScript(dir, "quick-exit.js", `console.log("dashboard listening at ${baseUrl}");\nsetTimeout(() => process.exit(0), 100);\n`);
    const longRunning = await writeNodeScript(dir, "long-running.js", `console.log("dashboard listening at ${baseUrl}");\nsetInterval(() => {}, 1000);\n`);

    const state = createDefaultState();
    const manager = new SymphonyProcessManager(state);
    const first = await manager.start({ binary: process.execPath, cwd: dir, workflow: quickExit, timeoutMs: 2000 });
    await waitForProcessExit(first.pid);

    const second = await manager.start({ binary: process.execPath, cwd: dir, workflow: longRunning, timeoutMs: 2000 });

    expect(second.baseUrl).toBe(baseUrl);
    expect(state.ownedProcess?.pid).toBe(second.pid);

    await manager.stopOwned();
  });

  it("clears stale owned state when the owned child already exited", async () => {
    const baseUrl = await stateServer();
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-process-"));
    const script = await writeNodeScript(dir, "quick-exit.js", `console.log("dashboard listening at ${baseUrl}");\nsetTimeout(() => process.exit(0), 100);\n`);

    const state = createDefaultState();
    const manager = new SymphonyProcessManager(state);
    const started = await manager.start({ binary: process.execPath, cwd: dir, workflow: script, timeoutMs: 2000 });
    await waitForProcessExit(started.pid);

    await expect(manager.stopOwned()).rejects.toMatchObject({ kind: "not_owned" });
    expect(state.ownedProcess).toBeUndefined();
  });

  it("does not stop when no owned child exists", async () => {
    const state = createDefaultState();
    const manager = new SymphonyProcessManager(state);
    await expect(manager.stopOwned()).rejects.toThrow("No Symphony process owned by this extension");
  });
});
