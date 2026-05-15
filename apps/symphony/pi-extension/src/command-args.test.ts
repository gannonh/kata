import { describe, expect, it } from "vitest";
import { parseAttachArgs, parseDoctorArgs, parseInitArgs, parseStartArgs, parseSteerArgs } from "./command-args.ts";

describe("command argument parsing", () => {
  it("parses init force flag", () => {
    expect(parseInitArgs("--force")).toEqual({ force: true });
    expect(parseInitArgs("")).toEqual({ force: false });
  });

  it("rejects unknown init flags", () => {
    expect(() => parseInitArgs("--bad")).toThrow("Unknown /symphony:init option: --bad");
  });

  it("keeps workflow arguments as one path string", () => {
    expect(parseDoctorArgs(".symphony/WORKFLOW.md")).toEqual({ workflow: ".symphony/WORKFLOW.md" });
    expect(parseStartArgs("/tmp/My Workflow.md")).toEqual({ workflow: "/tmp/My Workflow.md" });
    expect(parseStartArgs("   ")).toEqual({ workflow: undefined });
  });

  it("parses attach URL as optional", () => {
    expect(parseAttachArgs("http://127.0.0.1:8080")).toEqual({ url: "http://127.0.0.1:8080" });
    expect(parseAttachArgs("")).toEqual({ url: undefined });
  });

  it("parses steer issue and instruction", () => {
    expect(parseSteerArgs("SIM-123 Use the existing auth module")).toEqual({
      issueIdentifier: "SIM-123",
      instruction: "Use the existing auth module",
    });
    expect(() => parseSteerArgs("SIM-123")).toThrow("Usage: /symphony:steer <ISSUE> <instruction>");
    expect(() => parseSteerArgs("   ")).toThrow("Usage: /symphony:steer <ISSUE> <instruction>");
  });
});
