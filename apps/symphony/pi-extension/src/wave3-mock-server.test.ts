import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

let child: ChildProcessWithoutNullStreams | undefined;

afterEach(() => {
  child?.kill();
  child = undefined;
});

describe("wave3 mock server script", () => {
  it("serves Wave 3 state and accepts escalation responses", async () => {
    const baseUrl = await startMockServer();

    const stateResponse = await fetch(`${baseUrl}/api/v1/state`);
    const state = await stateResponse.json() as Record<string, unknown>;
    expect(stateResponse.status).toBe(200);
    expect(state).toMatchObject({
      retry_queue: [expect.objectContaining({ identifier: "SIM-200", due_in_ms: 90000 })],
      blocked: [expect.objectContaining({ identifier: "SIM-300", blocker_identifiers: ["SIM-100", "SIM-101"] })],
      completed: [expect.objectContaining({ identifier: "SIM-400", completed_at: "2026-05-14T13:00:00Z" })],
      pending_escalations: [expect.objectContaining({ request_id: "esc-1", preview: "Approve cargo test?" })],
    });

    const escalationResponse = await fetch(`${baseUrl}/api/v1/escalations/esc-1/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: { approved: true }, responder_id: "pi-dashboard" }),
    });
    await expect(escalationResponse.json()).resolves.toEqual({ ok: true });

    const afterResponse = await fetch(`${baseUrl}/api/v1/escalations`);
    await expect(afterResponse.json()).resolves.toEqual({ pending: [] });
  });

  it("returns 400 for malformed escalation IDs without crashing", async () => {
    const baseUrl = await startMockServer();

    const response = await fetch(`${baseUrl}/api/v1/escalations/%E0%A4%A/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: { approved: true }, responder_id: "pi-dashboard" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_escalation_id" });

    const stateResponse = await fetch(`${baseUrl}/api/v1/state`);
    expect(stateResponse.status).toBe(200);
  });
});

async function startMockServer(): Promise<string> {
  child = spawn(process.execPath, ["scripts/wave3-mock-server.mjs", "--port", "0"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NO_COLOR: "1" },
  });

  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`mock server did not start. stderr: ${stderr}`));
    }, 5000);

    child?.stdout.on("data", (chunk) => {
      stdout = (stdout + String(chunk)).slice(-2000);
      const match = stdout.match(/Mock Symphony server: (http:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });

    child?.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`mock server exited with code ${code}. stderr: ${stderr}`));
    });
  });
}
