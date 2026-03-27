import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  buildConsolePanelStateFromSnapshot,
  createEmptyConsolePanelState,
  resolveConsolePosition,
} from "../console-state.js";
import type { SymphonyOrchestratorState } from "../types.js";


describe("console-state", () => {
  it("maps orchestrator snapshots into console panel state", () => {
    const snapshot: SymphonyOrchestratorState = {
      poll_interval_ms: 30_000,
      max_concurrent_agents: 4,
      running: {
        "issue-1": {
          issue_id: "issue-1",
          issue_identifier: "KAT-1304",
          issue_title: "Operator Console",
          status: "running",
          linear_state: "In Progress",
          started_at: new Date(0).toISOString(),
          model: "claude-sonnet-4-6",
        },
      },
      retry_queue: [
        {
          issue_id: "issue-2",
          identifier: "KAT-1305",
          attempt: 2,
          due_in_ms: 5_000,
        },
      ],
      completed: [
        {
          issue_id: "issue-0",
          identifier: "KAT-1299",
          title: "Done issue",
          completed_at: new Date(10_000).toISOString(),
        },
      ],
      codex_totals: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      },
      polling: {
        checking: false,
        next_poll_in_ms: 10_000,
        poll_interval_ms: 30_000,
      },
      running_session_info: {
        "issue-1": {
          last_activity_ms: 18_000,
          current_tool_name: "bash",
        },
      },
      pending_escalations: [
        {
          request_id: "req-1",
          issue_id: "issue-1",
          issue_identifier: "KAT-1304",
          method: "ask_user_questions",
          preview: "Need operator input for rollout timing",
          created_at: new Date(12_000).toISOString(),
          timeout_ms: 300_000,
        },
      ],
    };

    const mapped = buildConsolePanelStateFromSnapshot(snapshot, {
      now: () => 20_000,
      connectionStatus: "connected",
      connectionUrl: "http://127.0.0.1:8080",
    });

    expect(mapped.connectionStatus).toBe("connected");
    expect(mapped.connectionUrl).toBe("http://127.0.0.1:8080");
    expect(mapped.queueCount).toBe(1);
    expect(mapped.completedCount).toBe(1);
    expect(mapped.workers).toHaveLength(1);
    expect(mapped.workers[0]).toMatchObject({
      issueId: "issue-1",
      identifier: "KAT-1304",
      issueTitle: "Operator Console",
      linearState: "In Progress",
      currentTool: "bash",
      model: "claude-sonnet-4-6",
    });
    expect(mapped.workers[0].lastActivityAge).toBe("2s");

    expect(mapped.escalations).toHaveLength(1);
    expect(mapped.escalations[0]).toMatchObject({
      requestId: "req-1",
      issueIdentifier: "KAT-1304",
      issueTitle: "Operator Console",
      questionPreview: "Need operator input for rollout timing",
      timeoutMs: 300_000,
    });
  });

  it("defaults console position when preference is unset or invalid", () => {
    expect(resolveConsolePosition(undefined)).toBe("below-output");
    expect(resolveConsolePosition("invalid")).toBe("below-output");
    expect(resolveConsolePosition("above-status")).toBe("above-status");
  });

  it("creates an empty disconnected panel state", () => {
    expect(createEmptyConsolePanelState("http://127.0.0.1:8080")).toEqual({
      workers: [],
      escalations: [],
      connectionStatus: "disconnected",
      connectionUrl: "http://127.0.0.1:8080",
      lastUpdateAt: null,
      queueCount: 0,
      completedCount: 0,
    });
  });
});

describe("symphony console preference parsing", () => {
  it("parses symphony.console_position from global and project preferences", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "kata-symphony-console-pref-"));
    const originalHome = process.env.HOME;

    try {
      const homeDir = join(tempDir, "home");
      const projectDir = join(tempDir, "project");
      mkdirSync(join(homeDir, ".kata-cli"), { recursive: true });
      mkdirSync(join(projectDir, ".kata"), { recursive: true });

      writeFileSync(
        join(homeDir, ".kata-cli", "preferences.md"),
        [
          "---",
          "version: 1",
          "symphony:",
          "  url: http://127.0.0.1:8080",
          "  console_position: above-status",
          "---",
          "",
        ].join("\n"),
        { encoding: "utf-8" },
      );

      writeFileSync(
        join(projectDir, ".kata", "preferences.md"),
        [
          "---",
          "version: 1",
          "symphony:",
          "  console_position: below-output",
          "---",
          "",
        ].join("\n"),
        { encoding: "utf-8" },
      );

      process.env.HOME = homeDir;

      vi.resetModules();
      vi.doMock("@mariozechner/pi-coding-agent", () => ({
        getAgentDir: () => join(homeDir, ".kata-cli", "agent"),
      }));

      const { loadEffectiveKataPreferences } = await import(
        "../../kata/preferences.js"
      );

      const loaded = loadEffectiveKataPreferences(projectDir);
      expect(loaded?.preferences.symphony).toEqual({
        url: "http://127.0.0.1:8080",
        console_position: "below-output",
      });
    } finally {
      vi.doUnmock("@mariozechner/pi-coding-agent");
      vi.resetModules();

      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
