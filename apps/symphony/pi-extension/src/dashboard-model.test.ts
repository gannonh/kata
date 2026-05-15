import { describe, expect, it } from "vitest";
import { buildWorkerRows, formatEventRows } from "./dashboard-model.ts";
import type { SymphonyEventEnvelope, SymphonyStateResponse } from "./http-client.ts";

function stateFixture(): SymphonyStateResponse {
  return {
    tracker_project_url: "https://linear.app/kata-sh/project/symphony",
    running: {
      "issue-123": {
        issue_id: "issue-123",
        issue_identifier: "SIM-123",
        issue_title: "Worker one",
        attempt: 2,
        workspace_path: "/tmp/symphony/issue-123",
        started_at: "2026-05-14T12:00:00Z",
        status: "running",
        worker_host: "worker-a",
        tracker_state: "In Progress",
      },
      "issue-777": {
        issue_id: "issue-777",
        issue_identifier: "SIM-777",
        issue_title: "Worker two",
        workspace_path: "/tmp/symphony/issue-777",
        started_at: "2026-05-14T12:05:00Z",
        status: "running",
        error: "agent exited after a very long error message that needs to be shortened for the dashboard",
      },
    },
    running_sessions: {
      "issue-123": { turn_count: 2, last_activity_at: "2026-05-14T12:03:00Z", last_event: "tool_call_completed", last_event_message: "running cargo test" },
    },
    running_session_info: {
      "issue-123": { turn_count: 3, max_turns: 20, last_activity_ms: Date.parse("2026-05-14T12:04:00Z"), last_error: null },
      "issue-777": { turn_count: 1, max_turns: 10, last_activity_ms: null, last_error: "usage limit" },
    },
    retry_queue: [],
    blocked: [],
    completed: [],
    polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000 },
  };
}

describe("dashboard model", () => {
  it("builds sorted worker rows with selected-worker detail fields", () => {
    const rows = buildWorkerRows(stateFixture());

    expect(rows.map((row) => row.issueIdentifier)).toEqual(["SIM-123", "SIM-777"]);
    expect(rows[0]).toMatchObject({
      issueId: "issue-123",
      issueIdentifier: "SIM-123",
      title: "Worker one",
      trackerState: "In Progress",
      attempt: "2",
      turnCount: "3",
      maxTurns: "20",
      lastActivity: "2026-05-14T12:04:00.000Z",
      workerHost: "worker-a",
      workspacePath: "/tmp/symphony/issue-123",
      errorPreview: "-",
    });
    expect(rows[1]?.attempt).toBe("1");
    expect(rows[1]?.trackerState).toBe("-");
    expect(rows[1]?.errorPreview).toBe("agent exited after a very long error message that needs to be shortened for the dashboard");
  });

  it("formats only recent worker and runtime events", () => {
    const events: SymphonyEventEnvelope[] = [
      { version: "v1", sequence: 1, timestamp: "2026-05-14T12:00:00Z", kind: "heartbeat", severity: "info", event: "heartbeat", payload: {} },
      { version: "v1", sequence: 2, timestamp: "2026-05-14T12:01:00Z", kind: "runtime", severity: "info", event: "poll_completed", payload: { summary: "checked tracker" } },
      { version: "v1", sequence: 3, timestamp: "2026-05-14T12:02:00Z", kind: "worker", severity: "error", issue: "SIM-123", event: "worker_failed", payload: { error_preview: "usage limit" } },
    ];

    expect(formatEventRows(events)).toEqual([
      "2026-05-14T12:02:00Z error worker SIM-123 worker_failed usage limit",
      "2026-05-14T12:01:00Z info runtime - poll_completed checked tracker",
    ]);
  });

  it("includes worker failure errors and steer instructions in event summaries", () => {
    const events: SymphonyEventEnvelope[] = [
      { version: "v1", sequence: 1, timestamp: "2026-05-14T12:00:00Z", kind: "worker", severity: "error", issue: "SIM-123", event: "worker_failed", payload: { error: "agent exited with code 1" } },
      { version: "v1", sequence: 2, timestamp: "2026-05-14T12:01:00Z", kind: "runtime", severity: "info", issue: "SIM-123", event: "steer_received", payload: { instruction_preview: "Focus on failing tests" } },
    ];

    expect(formatEventRows(events)).toEqual([
      "2026-05-14T12:01:00Z info runtime SIM-123 steer_received Focus on failing tests",
      "2026-05-14T12:00:00Z error worker SIM-123 worker_failed agent exited with code 1",
    ]);
  });
});
