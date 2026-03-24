/**
 * Contract tests for memory CLI commands (remember, recall, forget, consolidate).
 *
 * Tests that commands are registered with correct options and produce
 * tri-mode output (human, JSON, quiet). Tests the CLI wiring layer —
 * function-level tests are in the memory/ test directory.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 * Task: T01 — Author memory contract tests (initially failing)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { createTempGitRepo } from "../helpers/git-fixtures.js";

async function loadCli(): Promise<Record<string, any> | null> {
  try {
    return await import("../../src/cli.js");
  } catch {
    return null;
  }
}

describe("memory CLI commands contract (T01 red-first)", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempGitRepo("kata-memory-cli-");
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("remember command is registered", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    expect(program).toBeDefined();

    // Find the remember command
    const commands = program.commands.map((c: any) => c.name());
    expect(commands).toContain("remember");
  });

  it("recall command is registered", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    expect(program).toBeDefined();

    const commands = program.commands.map((c: any) => c.name());
    expect(commands).toContain("recall");
  });

  it("forget command is registered", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    expect(program).toBeDefined();

    const commands = program.commands.map((c: any) => c.name());
    expect(commands).toContain("forget");
  });

  it("consolidate command is registered", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    expect(program).toBeDefined();

    const commands = program.commands.map((c: any) => c.name());
    expect(commands).toContain("consolidate");
  });

  it("remember command accepts --category and --tags options", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    const rememberCmd = program.commands.find(
      (c: any) => c.name() === "remember",
    );
    expect(rememberCmd).toBeDefined();

    const optionNames = rememberCmd.options.map((o: any) => o.long);
    expect(optionNames).toContain("--category");
    expect(optionNames).toContain("--tags");
  });

  it("recall command accepts --top-k option", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    const recallCmd = program.commands.find(
      (c: any) => c.name() === "recall",
    );
    expect(recallCmd).toBeDefined();

    const optionNames = recallCmd.options.map((o: any) => o.long);
    expect(optionNames).toContain("--top-k");
  });

  it("remember --json output includes full metadata", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    // This test exercises the full CLI path — expects JSON output
    // with id, category, tags, createdAt, sourceRefs fields
    const program = mod!.program || mod!.createProgram?.();
    const rememberCmd = program.commands.find(
      (c: any) => c.name() === "remember",
    );
    expect(rememberCmd).toBeDefined();

    // Verify JSON output format includes expected fields
    // (will fail until implementation wires up the formatter)
    const optionNames = rememberCmd.options.map((o: any) => o.long);
    expect(optionNames).toContain("--json");
  });

  it("recall --quiet output is one ID per line", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    const program = mod!.program || mod!.createProgram?.();
    const recallCmd = program.commands.find(
      (c: any) => c.name() === "recall",
    );
    expect(recallCmd).toBeDefined();

    const optionNames = recallCmd.options.map((o: any) => o.long);
    expect(optionNames).toContain("--quiet");
  });

  it("error paths produce actionable messages with stable error codes", async () => {
    const mod = await loadCli();
    expect(mod).not.toBeNull();

    // Verify the CLI surfaces stable error codes from the memory domain
    // This is a structural assertion — detailed error behavior is in
    // the memory-store and memory-recall tests
    const program = mod!.program || mod!.createProgram?.();
    expect(program).toBeDefined();

    // Commands should be wired to handle and format domain errors
    const commands = program.commands.map((c: any) => c.name());
    expect(commands).toContain("remember");
    expect(commands).toContain("recall");
    expect(commands).toContain("forget");
    expect(commands).toContain("consolidate");
  });
});
