/**
 * App-level smoke tests for the kata CLI package.
 *
 * Tests the glue code that IS the product:
 * - app-paths resolve to ~/.kata-cli/
 * - loader delegates into the standalone CLI entrypoint
 * - resource-loader syncs bundled resources
 * - wizard loadStoredEnvKeys hydrates env
 * - npm pack produces a valid tarball
 * - tarball installs and the `kata` binary resolves
 */

import { describe, it, expect } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");

// ═══════════════════════════════════════════════════════════════════════════
// 1. app-paths
// ═══════════════════════════════════════════════════════════════════════════

describe("app-paths", () => {
  it("resolves to ~/.kata-cli/", async () => {
    const { appRoot, agentDir, sessionsDir, authFilePath } =
      await import("../app-paths.ts");
    const home = process.env.HOME!;

    expect(appRoot).toBe(join(home, ".kata-cli"));
    expect(agentDir).toBe(join(home, ".kata-cli", "agent"));
    expect(sessionsDir).toBe(join(home, ".kata-cli", "sessions"));
    expect(authFilePath).toBe(join(home, ".kata-cli", "agent", "auth.json"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. loader entrypoint
// ═══════════════════════════════════════════════════════════════════════════

describe("loader entrypoint", () => {
  it("delegates directly to cli.js", () => {
    const loaderSrc = readFileSync(
      join(projectRoot, "src", "loader.ts"),
      "utf-8",
    );
    expect(loaderSrc).toMatch(/^#!\/usr\/bin\/env node/);
    expect(loaderSrc).toContain('await import("./cli.js")');
  });

  it("symphony command registers config + console subcommands", () => {
    const commandSrc = readFileSync(
      join(projectRoot, "src", "resources", "extensions", "symphony", "command.ts"),
      "utf-8",
    );

    expect(commandSrc).toContain('type: "config"');
    expect(commandSrc).toContain('type: "console"');
    expect(commandSrc).toContain('/symphony config <path>');
    expect(commandSrc).toContain('value: "console off"');
    expect(commandSrc).toContain('description: "Symphony operator workflows: status, watch, steer, config, console"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. resource-loader syncs bundled resources
// ═══════════════════════════════════════════════════════════════════════════

describe("resource-loader", () => {
  it("syncs extensions, agents, and AGENTS.md to target dir", async () => {
    const { initResources } = await import("../resource-loader.ts");
    const tmp = mkdtempSync(join(tmpdir(), "kata-resources-test-"));
    const fakeAgentDir = join(tmp, "agent");

    try {
      initResources(fakeAgentDir);

      expect(existsSync(join(fakeAgentDir, "extensions", "kata", "index.ts"))).toBe(true);
      expect(existsSync(join(fakeAgentDir, "extensions", "browser-tools", "index.ts"))).toBe(true);
      expect(existsSync(join(fakeAgentDir, "extensions", "search-the-web", "index.ts"))).toBe(true);
      expect(existsSync(join(fakeAgentDir, "extensions", "context7", "index.ts"))).toBe(true);
      expect(existsSync(join(fakeAgentDir, "extensions", "subagent", "index.ts"))).toBe(true);
      expect(existsSync(join(fakeAgentDir, "extensions", "symphony", "index.ts"))).toBe(true);

      expect(existsSync(join(fakeAgentDir, "agents", "scout.md"))).toBe(true);

      expect(existsSync(join(fakeAgentDir, "AGENTS.md"))).toBe(true);
      const agentsMd = readFileSync(join(fakeAgentDir, "AGENTS.md"), "utf-8");
      expect(agentsMd.length).toBeGreaterThan(1000);

      // Idempotent: run again, no crash
      initResources(fakeAgentDir);
      expect(existsSync(join(fakeAgentDir, "extensions", "kata", "index.ts"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. wizard loadStoredEnvKeys hydration
// ═══════════════════════════════════════════════════════════════════════════

describe("wizard loadStoredEnvKeys", () => {
  it("hydrates process.env from auth.json", async () => {
    const { loadStoredEnvKeys } = await import("../wizard.ts");
    const { AuthStorage } = await import("@mariozechner/pi-coding-agent");

    const tmp = mkdtempSync(join(tmpdir(), "kata-wizard-test-"));
    const authPath = join(tmp, "auth.json");
    writeFileSync(
      authPath,
      JSON.stringify({
        brave: { type: "api_key", key: "test-brave-key" },
        brave_answers: { type: "api_key", key: "test-answers-key" },
        context7: { type: "api_key", key: "test-ctx7-key" },
      }),
    );

    const origBrave = process.env.BRAVE_API_KEY;
    const origBraveAnswers = process.env.BRAVE_ANSWERS_KEY;
    const origCtx7 = process.env.CONTEXT7_API_KEY;
    const origJina = process.env.JINA_API_KEY;
    delete process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_ANSWERS_KEY;
    delete process.env.CONTEXT7_API_KEY;
    delete process.env.JINA_API_KEY;

    try {
      const auth = AuthStorage.create(authPath);
      loadStoredEnvKeys(auth);

      expect(process.env.BRAVE_API_KEY).toBe("test-brave-key");
      expect(process.env.BRAVE_ANSWERS_KEY).toBe("test-answers-key");
      expect(process.env.CONTEXT7_API_KEY).toBe("test-ctx7-key");
      expect(process.env.JINA_API_KEY).toBeUndefined();
    } finally {
      if (origBrave) process.env.BRAVE_API_KEY = origBrave;
      else delete process.env.BRAVE_API_KEY;
      if (origBraveAnswers) process.env.BRAVE_ANSWERS_KEY = origBraveAnswers;
      else delete process.env.BRAVE_ANSWERS_KEY;
      if (origCtx7) process.env.CONTEXT7_API_KEY = origCtx7;
      else delete process.env.CONTEXT7_API_KEY;
      if (origJina) process.env.JINA_API_KEY = origJina;
      else delete process.env.JINA_API_KEY;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing env vars", async () => {
    const { loadStoredEnvKeys } = await import("../wizard.ts");
    const { AuthStorage } = await import("@mariozechner/pi-coding-agent");

    const tmp = mkdtempSync(join(tmpdir(), "kata-wizard-nooverwrite-"));
    const authPath = join(tmp, "auth.json");
    writeFileSync(
      authPath,
      JSON.stringify({
        brave: { type: "api_key", key: "stored-key" },
      }),
    );

    const origBrave = process.env.BRAVE_API_KEY;
    process.env.BRAVE_API_KEY = "existing-env-key";

    try {
      const auth = AuthStorage.create(authPath);
      loadStoredEnvKeys(auth);

      expect(process.env.BRAVE_API_KEY).toBe("existing-env-key");
    } finally {
      if (origBrave) process.env.BRAVE_API_KEY = origBrave;
      else delete process.env.BRAVE_API_KEY;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. npm pack produces valid tarball with correct file layout
// ═══════════════════════════════════════════════════════════════════════════

describe("npm pack", () => {
  it("produces tarball with required files", { timeout: 60_000 }, async () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const packOutput = execSync("npm pack --json 2>/dev/null", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    const packInfo = JSON.parse(packOutput);
    const tarball = packInfo[0].filename;
    const tarballPath = join(projectRoot, tarball);

    expect(existsSync(tarballPath)).toBe(true);

    try {
      const contents = execFileSync("tar", ["tzf", tarballPath], { encoding: "utf-8" });
      const files = contents.split("\n").filter(Boolean);

      expect(files.some((f) => f.includes("dist/loader.js"))).toBe(true);
      expect(files.some((f) => f.includes("dist/cli.js"))).toBe(true);
      expect(files.some((f) => f.includes("dist/app-paths.js"))).toBe(true);
      expect(files.some((f) => f.includes("dist/wizard.js"))).toBe(true);
      expect(files.some((f) => f.includes("dist/resource-loader.js"))).toBe(true);
      expect(files.some((f) => f.includes("pkg/package.json"))).toBe(true);
      expect(files.some((f) => f.includes("src/resources/extensions/kata/index.ts"))).toBe(true);
      expect(files.some((f) => f.includes("src/resources/AGENTS.md"))).toBe(true);
      expect(files.some((f) => f.includes("scripts/postinstall.js"))).toBe(true);

      const pkgJson = readFileSync(
        join(projectRoot, "pkg", "package.json"),
        "utf-8",
      );
      const pkg = JSON.parse(pkgJson);
      expect(pkg.piConfig?.name).toBe("kata");
      expect(pkg.piConfig?.configDir).toBe(".kata-cli");
    } finally {
      rmSync(tarballPath, { force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. npm pack → install → kata-cli binary resolves
// ═══════════════════════════════════════════════════════════════════════════

describe("npm install", () => {
  it("tarball installs and kata-cli binary resolves", { timeout: 60_000 }, async () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });
    const packOutput = execSync("npm pack --json 2>/dev/null", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    const packInfo = JSON.parse(packOutput);
    const tarball = packInfo[0].filename;
    const tarballPath = join(projectRoot, tarball);

    const tmp = mkdtempSync(join(tmpdir(), "kata-install-test-"));

    try {
      execFileSync("npm", ["install", "--prefix", tmp, tarballPath, "--no-save"], {
        encoding: "utf-8",
        env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
        stdio: "pipe",
      });

      const installedBin = join(tmp, "node_modules", ".bin", "kata-cli");
      expect(existsSync(installedBin)).toBe(true);

      const installedLoader = join(
        tmp,
        "node_modules",
        "@kata-sh",
        "cli",
        "dist",
        "loader.js",
      );
      const loaderContent = readFileSync(installedLoader, "utf-8");
      expect(loaderContent).toMatch(/^#!\/usr\/bin\/env node/);

      const installedKataExt = join(
        tmp,
        "node_modules",
        "@kata-sh",
        "cli",
        "src",
        "resources",
        "extensions",
        "kata",
        "index.ts",
      );
      expect(existsSync(installedKataExt)).toBe(true);
    } finally {
      rmSync(tarballPath, { force: true });
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. standalone CLI entrypoints
// ═══════════════════════════════════════════════════════════════════════════

describe("standalone CLI", () => {
  it("initResources scaffolds starter mcp.json on first launch", async () => {
    const { initResources } = await import("../resource-loader.ts");
    const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-scaffold-"));
    const fakeAgentDir = join(tmp, "agent");

    try {
      initResources(fakeAgentDir);

      const mcpPath = join(fakeAgentDir, "mcp.json");
      expect(existsSync(mcpPath)).toBe(true);

      const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
      expect(config.settings).toBeDefined();
      expect(config.settings.toolPrefix).toBe("server");
      expect(config.imports).toEqual([]);
      expect(config.mcpServers).toEqual({});

      // Verify it's not overwritten on second launch
      writeFileSync(mcpPath, JSON.stringify({ mcpServers: { custom: { url: "http://test" } } }));
      initResources(fakeAgentDir);
      const afterSecondRun = JSON.parse(readFileSync(mcpPath, "utf-8"));
      expect(afterSecondRun.mcpServers.custom).toBeDefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("cli.ts exposes setup, doctor, and json commands", () => {
    const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
    expect(cliSrc).toContain('if (command === "setup")');
    expect(cliSrc).toContain('if (command === "doctor")');
    expect(cliSrc).toContain('if (command === "json")');
    expect(cliSrc).toContain('"  kata setup"');
    expect(cliSrc).toContain('"  kata doctor"');
    expect(cliSrc).toContain('"  kata json <request.json>"');
  });

  it("built loader emits detected harness JSON for setup", { timeout: 30_000 }, () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });
    const output = execFileSync("node", ["dist/loader.js", "setup"], {
      cwd: projectRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        CODEX_HOME: "/tmp/codex-home",
      },
    });

    expect(JSON.parse(output)).toEqual({
      ok: true,
      harness: "codex",
    });
  });

  it("built loader runs setup --pi with structured install diagnostics", { timeout: 30_000 }, () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const tmp = mkdtempSync(join(tmpdir(), "kata-setup-pi-smoke-"));
    const sourceSkills = join(tmp, "source-skills");
    const agentDir = join(tmp, "pi-agent");
    const skillDir = join(sourceSkills, "demo-skill");

    try {
      execSync(`mkdir -p "${skillDir}"`);
      writeFileSync(join(skillDir, "SKILL.md"), "# Demo Skill\n", "utf-8");

      const output = execFileSync("node", ["dist/loader.js", "setup", "--pi"], {
        cwd: projectRoot,
        encoding: "utf-8",
        env: {
          ...process.env,
          PI_CODING_AGENT_DIR: agentDir,
          KATA_CLI_SKILLS_SOURCE_DIR: sourceSkills,
        },
      });
      const result = JSON.parse(output);

      expect(result.ok).toBe(true);
      expect(result.mode).toBe("pi-install");
      expect(result.pi?.markerWritten).toBe(true);
      expect(result.pi?.settingsWritten).toBe(true);
      expect(existsSync(join(agentDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
      expect(existsSync(join(agentDir, "settings.json"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("built loader emits a structured doctor report", { timeout: 30_000 }, () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });
    const output = execFileSync("node", ["dist/loader.js", "doctor"], {
      cwd: projectRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        CURSOR_CONFIG_HOME: "/tmp/cursor-home",
      },
    });

    const report = JSON.parse(output);
    expect(report.summary).toBe("kata doctor ok (cursor)");
    expect(report.status).toBe("ok");
    expect(report.harness).toBe("cursor");
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.some((check: { name: string; status: string }) =>
      check.name === "harness" && check.status === "ok")).toBe(true);
    expect(report.checks.some((check: { name: string; status: string }) =>
      check.name === "skills-source" && check.status === "ok")).toBe(true);
    expect(report.checks.some((check: { name: string; status: string }) =>
      check.name === "backend-config" && check.status === "ok")).toBe(true);
  });

  it("built loader keeps unsupported json operation behavior coherent", { timeout: 30_000 }, () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const tmp = mkdtempSync(join(tmpdir(), "kata-json-smoke-"));
    const workspace = join(tmp, "workspace");
    const kataDir = join(workspace, ".kata");
    const requestPath = join(tmp, "request.json");

    try {
      execSync(`mkdir -p "${kataDir}"`);
      writeFileSync(
        join(kataDir, "preferences.md"),
        ["---", "workflow:", "  mode: linear", "---", ""].join("\n"),
        "utf-8",
      );
      writeFileSync(
        requestPath,
        JSON.stringify({
          operation: "unknown.operation",
          payload: {},
        }),
        "utf-8",
      );

      const output = execFileSync("node", [join(projectRoot, "dist", "loader.js"), "json", requestPath], {
        cwd: workspace,
        encoding: "utf-8",
      });

      expect(JSON.parse(output)).toEqual({
        ok: false,
        error: {
          code: "UNKNOWN",
          message: "Unsupported operation: unknown.operation",
        },
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("built loader returns structured JSON errors for invalid json command input", { timeout: 30_000 }, () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const tmp = mkdtempSync(join(tmpdir(), "kata-json-invalid-input-"));
    const workspace = join(tmp, "workspace");
    const kataDir = join(workspace, ".kata");
    const invalidJsonPath = join(tmp, "invalid.json");
    const arrayPayloadPath = join(tmp, "array.json");
    const missingOperationPath = join(tmp, "missing-operation.json");
    const invalidOperationPath = join(tmp, "invalid-operation.json");
    const invalidPayloadPath = join(tmp, "invalid-payload.json");

    const runJson = (requestPath?: string) =>
      execFileSync(
        "node",
        [join(projectRoot, "dist", "loader.js"), "json", ...(requestPath ? [requestPath] : [])],
        {
          cwd: workspace,
          encoding: "utf-8",
        },
      );

    try {
      execSync(`mkdir -p "${kataDir}"`);
      writeFileSync(
        join(kataDir, "preferences.md"),
        ["---", "workflow:", "  mode: linear", "---", ""].join("\n"),
        "utf-8",
      );
      writeFileSync(invalidJsonPath, "{", "utf-8");
      writeFileSync(arrayPayloadPath, JSON.stringify(["not-an-object"]), "utf-8");
      writeFileSync(missingOperationPath, JSON.stringify({ payload: {} }), "utf-8");
      writeFileSync(invalidOperationPath, JSON.stringify({ operation: 42, payload: {} }), "utf-8");
      writeFileSync(invalidPayloadPath, JSON.stringify({ operation: "unknown.operation", payload: 42 }), "utf-8");

      expect(JSON.parse(runJson())).toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Missing request path. Usage: kata json <request.json>",
        },
      });
      expect(JSON.parse(runJson(invalidJsonPath))).toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Request file must contain valid JSON.",
        },
      });
      expect(JSON.parse(runJson(arrayPayloadPath))).toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "JSON request must be an object.",
        },
      });
      expect(JSON.parse(runJson(missingOperationPath))).toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "JSON request must include a non-empty string operation.",
        },
      });
      expect(JSON.parse(runJson(invalidOperationPath))).toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "JSON request must include a non-empty string operation.",
        },
      });
      expect(JSON.parse(runJson(invalidPayloadPath))).toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "JSON request payload must be an object when provided.",
        },
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("built loader returns structured JSON errors for supported operations when backend resolution fails", {
    timeout: 30_000,
  }, () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const tmp = mkdtempSync(join(tmpdir(), "kata-json-backend-error-"));
    const workspace = join(tmp, "workspace");
    const kataDir = join(workspace, ".kata");
    const requestPath = join(tmp, "request.json");

    try {
      execSync(`mkdir -p "${kataDir}"`);
      writeFileSync(
        join(kataDir, "preferences.md"),
        [
          "---",
          "workflow:",
          "  mode: github",
          "github:",
          "  repoOwner: kata-sh",
          "  repoName: kata-mono",
          "  stateMode: labels",
          "---",
          "",
        ].join("\n"),
        "utf-8",
      );
      writeFileSync(
        requestPath,
        JSON.stringify({
          operation: "milestone.getActive",
          payload: {},
        }),
        "utf-8",
      );

      const output = execFileSync("node", [join(projectRoot, "dist", "loader.js"), "json", requestPath], {
        cwd: workspace,
        encoding: "utf-8",
      });

      expect(JSON.parse(output)).toEqual({
        ok: false,
        error: {
          code: "INVALID_CONFIG",
          message:
            "GitHub label mode is no longer supported. Use github.stateMode: projects_v2 and set github.githubProjectNumber.",
        },
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
