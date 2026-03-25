/**
 * CLI command registration tests for watch + get — S04/T01
 */

import { describe, it, expect } from "vitest";
import { program } from "../../src/cli.js";

describe("CLI command registration", () => {
  it("watch command is registered", () => {
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    expect(watchCmd).toBeDefined();
    expect(watchCmd!.description()).toContain("Watch");
  });

  it("get command is registered", () => {
    const getCmd = program.commands.find((c) => c.name() === "get");
    expect(getCmd).toBeDefined();
    expect(getCmd!.description()).toContain("combined");
  });

  it("get command has --budget option", () => {
    const getCmd = program.commands.find((c) => c.name() === "get");
    expect(getCmd).toBeDefined();
    const budgetOpt = getCmd!.options.find(
      (o) => o.long === "--budget",
    );
    expect(budgetOpt).toBeDefined();
  });

  it("get command has --kind option", () => {
    const getCmd = program.commands.find((c) => c.name() === "get");
    expect(getCmd).toBeDefined();
    const kindOpt = getCmd!.options.find(
      (o) => o.long === "--kind",
    );
    expect(kindOpt).toBeDefined();
  });

  it("watch command has --debounce option", () => {
    const watchCmd = program.commands.find((c) => c.name() === "watch");
    expect(watchCmd).toBeDefined();
    const debounceOpt = watchCmd!.options.find(
      (o) => o.long === "--debounce",
    );
    expect(debounceOpt).toBeDefined();
  });

  it("all original commands still registered", () => {
    const expectedCmds = [
      "index", "status", "graph", "grep", "search", "find",
      "remember", "recall", "forget", "consolidate",
      "watch", "get",
    ];
    const cmdNames = program.commands.map((c) => c.name());
    for (const name of expectedCmds) {
      expect(cmdNames).toContain(name);
    }
  });
});
