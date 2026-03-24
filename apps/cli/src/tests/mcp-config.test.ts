import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

test("resolveEffectiveMcpConfigPath merges approved project config on first run when agentDir is missing", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-no-global-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(projectMcpDir, { recursive: true });

  writeFileSync(
    join(projectMcpDir, "mcp.json"),
    JSON.stringify(
      {
        imports: ["cursor"],
        settings: { projectFlag: true },
        mcpServers: {
          projectOnly: { command: "node", args: ["x"] },
        },
      },
      null,
      2,
    ),
  );

  try {
    assert.equal(existsSync(agentDir), false);

    const result = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: async () => true,
      isInteractive: false,
    });

    assert.equal(result.usedProjectConfig, true);
    assert.equal(result.configPath, join(agentDir, "mcp.effective.json"));
    assert.equal(result.projectConfigPath, join(projectMcpDir, "mcp.json"));
    assert.equal(existsSync(agentDir), true);

    const merged = JSON.parse(readFileSync(result.configPath, "utf-8"));
    assert.deepEqual(merged.imports, ["cursor"]);
    assert.equal(merged.settings.projectFlag, true);
    assert.ok(merged.mcpServers.projectOnly, "project-only server preserved");
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
    const expectedConsentKey = resolve(join(projectMcpDir, "mcp.json"));
    const expectedConsentHash = createHash("sha256")
      .update(
        JSON.stringify(
          JSON.parse(readFileSync(join(projectMcpDir, "mcp.json"), "utf-8")),
        ),
      )
      .digest("hex");
    assert.deepEqual(consent.projects[expectedConsentKey], {
      status: "approved",
      hash: expectedConsentHash,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveEffectiveMcpConfigPath requires reconfirmation after approved project config changes", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-reconfirm-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectMcpDir, { recursive: true });

  writeFileSync(
    join(agentDir, "mcp.json"),
    JSON.stringify({ imports: [], settings: {}, mcpServers: {} }, null, 2),
  );
  const projectConfigPath = join(projectMcpDir, "mcp.json");
  writeFileSync(
    projectConfigPath,
    JSON.stringify({ imports: ["cursor"], settings: {}, mcpServers: {} }, null, 2),
  );

  let promptCount = 0;
  const confirm = async () => {
    promptCount += 1;
    return true;
  };

  try {
    const first = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: confirm,
      isInteractive: false,
    });
    assert.equal(first.usedProjectConfig, true);
    assert.equal(promptCount, 1);

    writeFileSync(
      projectConfigPath,
      JSON.stringify({ imports: ["cursor", "vscode"], settings: {}, mcpServers: {} }, null, 2),
    );

    const second = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: confirm,
      isInteractive: false,
    });
    assert.equal(second.usedProjectConfig, true);
    assert.equal(promptCount, 2);
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

test("resolveEffectiveMcpConfigPath falls back to global config when project config is invalid JSON", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-invalid-project-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectMcpDir, { recursive: true });

  const globalPath = join(agentDir, "mcp.json");
  writeFileSync(globalPath, JSON.stringify({ imports: [], settings: {}, mcpServers: {} }, null, 2));
  writeFileSync(join(projectMcpDir, "mcp.json"), "{ invalid json", "utf-8");

  try {
    const result = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      isInteractive: false,
    });
    assert.equal(result.usedProjectConfig, false);
    assert.equal(result.configPath, globalPath);
    assert.equal(result.projectConfigPath, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveEffectiveMcpConfigPath falls back to global config when writing effective file fails", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-write-fail-"));
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
  mkdirSync(join(agentDir, "mcp.effective.json"), { recursive: true });

  try {
    const result = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: async () => true,
      isInteractive: false,
    });
    assert.equal(result.usedProjectConfig, false);
    assert.equal(result.configPath, globalPath);
    assert.equal(result.projectConfigPath, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveEffectiveMcpConfigPath does not rewrite unchanged effective config", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-no-rewrite-"));
  const agentDir = join(tmp, "agent");
  const appRoot = join(tmp, ".kata-cli");
  const cwd = join(tmp, "project");
  const projectMcpDir = join(cwd, ".kata-cli");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectMcpDir, { recursive: true });

  writeFileSync(
    join(agentDir, "mcp.json"),
    JSON.stringify({ imports: ["claude-code"], settings: {}, mcpServers: {} }, null, 2),
  );
  writeFileSync(
    join(projectMcpDir, "mcp.json"),
    JSON.stringify({ imports: ["cursor"], settings: {}, mcpServers: {} }, null, 2),
  );

  try {
    const first = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      confirmProjectMcpUse: async () => true,
      isInteractive: false,
    });
    const before = statSync(first.configPath).mtimeMs;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));

    const second = await resolveEffectiveMcpConfigPath({
      agentDir,
      appRoot,
      cwd,
      isInteractive: false,
    });
    const after = statSync(second.configPath).mtimeMs;

    assert.equal(second.usedProjectConfig, true);
    assert.equal(first.configPath, second.configPath);
    assert.equal(after, before);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
