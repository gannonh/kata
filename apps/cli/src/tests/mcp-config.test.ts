import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mergeMcpConfigs, resolveEffectiveMcpConfigPath } from "../mcp-config.ts";

test("mergeMcpConfigs applies project precedence and concatenates imports", () => {
  const merged = mergeMcpConfigs(
    {
      imports: ["claude-code"],
      settings: { toolPrefix: "server", idleTimeout: 10, globalOnly: true },
      mcpServers: {
        globalOnly: { command: "node", args: ["a"] },
        shared: { command: "node", args: ["global"] },
      },
      topLevel: "global",
    },
    {
      imports: ["cursor", "vscode"],
      settings: { idleTimeout: 30, projectOnly: true },
      mcpServers: {
        shared: { command: "node", args: ["project"] },
        projectOnly: { command: "node", args: ["b"] },
      },
      topLevel: "project",
    },
  );

  assert.deepEqual(merged.imports, ["claude-code", "cursor", "vscode"]);
  assert.deepEqual(merged.settings, {
    toolPrefix: "server",
    idleTimeout: 30,
    globalOnly: true,
    projectOnly: true,
  });
  assert.deepEqual(merged.mcpServers, {
    globalOnly: { command: "node", args: ["a"] },
    shared: { command: "node", args: ["project"] },
    projectOnly: { command: "node", args: ["b"] },
  });
  assert.equal(merged.topLevel, "project");
});

test("resolveEffectiveMcpConfigPath returns global config when no project config exists", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-resolve-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });

  const globalPath = join(agentDir, "mcp.json");
  writeFileSync(globalPath, JSON.stringify({ imports: [], settings: {}, mcpServers: {} }, null, 2));

  try {
    const result = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      isInteractive: false,
    });
    assert.equal(result.configPath, globalPath);
    assert.equal(result.usedProjectConfig, false);
    assert.equal(result.projectConfigPath, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveEffectiveMcpConfigPath merges approved project config and persists consent", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-approved-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectMcpDir, { recursive: true });

  writeFileSync(
    join(agentDir, "mcp.json"),
    JSON.stringify(
      {
        imports: ["claude-code"],
        settings: { idleTimeout: 10 },
        mcpServers: { shared: { command: "node", args: ["global"] } },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(projectMcpDir, "mcp.json"),
    JSON.stringify(
      {
        imports: ["cursor"],
        settings: { idleTimeout: 45, projectFlag: true },
        mcpServers: {
          shared: { command: "node", args: ["project"] },
          projectOnly: { command: "node", args: ["x"] },
        },
      },
      null,
      2,
    ),
  );

  try {
    const result = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: async () => true,
      isInteractive: false,
    });

    assert.equal(result.usedProjectConfig, true);
    assert.equal(result.projectConfigPath, join(projectMcpDir, "mcp.json"));
    assert.equal(result.configPath, join(agentDir, "mcp.effective.json"));
    assert.ok(existsSync(result.configPath), "effective config file is written");

    const merged = JSON.parse(readFileSync(result.configPath, "utf-8"));
    assert.deepEqual(merged.imports, ["claude-code", "cursor"]);
    assert.equal(merged.settings.idleTimeout, 45);
    assert.equal(merged.settings.projectFlag, true);
    assert.deepEqual(merged.mcpServers.shared.args, ["project"]);
    assert.ok(merged.mcpServers.projectOnly, "project-only server preserved");

    const consentPath = join(appRoot, "project-mcp-consent.json");
    assert.ok(existsSync(consentPath), "consent file persisted after approval");
    const consent = JSON.parse(readFileSync(consentPath, "utf-8"));
    assert.equal(consent.version, 1);
    assert.equal(consent.projects[join(projectMcpDir, "mcp.json")], "approved");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveEffectiveMcpConfigPath stores denied decision and keeps global config", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-denied-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectMcpDir, { recursive: true });

  const globalPath = join(agentDir, "mcp.json");
  writeFileSync(globalPath, JSON.stringify({ imports: [], settings: {}, mcpServers: {} }, null, 2));
  writeFileSync(
    join(projectMcpDir, "mcp.json"),
    JSON.stringify({ imports: ["cursor"], settings: {}, mcpServers: {} }, null, 2),
  );

  try {
    const first = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: async () => false,
      isInteractive: false,
    });
    assert.equal(first.configPath, globalPath);
    assert.equal(first.usedProjectConfig, false);

    const second = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      isInteractive: false,
    });
    assert.equal(second.configPath, globalPath);
    assert.equal(second.usedProjectConfig, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveEffectiveMcpConfigPath skips project config in non-interactive mode before consent", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-non-tty-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectMcpDir, { recursive: true });

  writeFileSync(join(agentDir, "mcp.json"), JSON.stringify({ imports: [], settings: {}, mcpServers: {} }, null, 2));
  writeFileSync(
    join(projectMcpDir, "mcp.json"),
    JSON.stringify({ imports: ["cursor"], settings: {}, mcpServers: {} }, null, 2),
  );

  try {
    const result = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      isInteractive: false,
    });
    assert.equal(result.usedProjectConfig, false);
    assert.equal(result.configPath, join(agentDir, "mcp.json"));
    assert.equal(existsSync(join(appRoot, "project-mcp-consent.json")), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
