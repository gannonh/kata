import { describe, expect, it } from "vitest";

import { detectHarness } from "../commands/setup.js";
import { renderDoctorReport } from "../commands/doctor.js";
import { runJsonCommand } from "../transports/json.js";

describe("detectHarness", () => {
  it("prefers explicit environment hints in stable order", () => {
    expect(detectHarness({ CODEX_HOME: "/tmp/codex" })).toBe("codex");
    expect(detectHarness({ CLAUDE_CONFIG_DIR: "/tmp/claude" })).toBe("claude");
    expect(detectHarness({ CURSOR_CONFIG_HOME: "/tmp/cursor" })).toBe("cursor");
  });
});

describe("renderDoctorReport", () => {
  it("marks GitHub label mode as unsupported", () => {
    const report = renderDoctorReport({
      packageVersion: "1.0.0",
      backendConfigStatus: "invalid",
      backendConfigMessage: "GitHub label mode is no longer supported",
      harness: "codex",
    });

    expect(report.summary).toContain("invalid");
    expect(report.checks[0]?.message).toContain("label mode");
  });
});

describe("runJsonCommand", () => {
  it("returns JSON for project.getContext", async () => {
    const output = await runJsonCommand(
      { operation: "project.getContext", payload: {} },
      {
        project: { getContext: async () => ({ backend: "github", workspacePath: "/tmp/repo" }) },
      } as any,
    );

    expect(output).toBe('{"ok":true,"data":{"backend":"github","workspacePath":"/tmp/repo"}}');
  });
});
