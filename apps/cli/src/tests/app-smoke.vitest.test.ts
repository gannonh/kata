/**
 * App-level smoke tests for the kata CLI package.
 *
 * Tests the glue code that IS the product:
 * - app-paths resolve to ~/.kata-cli/
 * - loader sets all required env vars
 * - resource-loader syncs bundled resources
 * - wizard loadStoredEnvKeys hydrates env
 * - npm pack produces a valid tarball
 * - tarball installs and the `kata` binary resolves
 */

import { describe, it, expect } from "vitest";
import { execFileSync, execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
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
// 2. loader env vars
// ═══════════════════════════════════════════════════════════════════════════

describe("loader env vars", () => {
  it("sets all 4 KATA_ env vars and PI_PACKAGE_DIR", async () => {
    const { agentDir: ad } = await import("../app-paths.ts");
    expect(ad).toMatch(/\.kata-cli\/agent$/);

    const loaderSrc = readFileSync(
      join(projectRoot, "src", "loader.ts"),
      "utf-8",
    );
    expect(loaderSrc).toContain("PI_PACKAGE_DIR");
    expect(loaderSrc).toContain("KATA_CODING_AGENT_DIR");
    expect(loaderSrc).toContain("KATA_BIN_PATH");
    expect(loaderSrc).toContain("KATA_WORKFLOW_PATH");
    expect(loaderSrc).toContain("KATA_BUNDLED_EXTENSION_PATHS");

    const extNames = [
      '"kata"',
      '"bg-shell"',
      '"browser-tools"',
      '"context7"',
      '"search-the-web"',
      '"slash-commands"',
      '"subagent"',
      '"mac-tools"',
      '"linear"',
      '"symphony"',
      '"pr-lifecycle"',
      '"ask-user-questions.ts"',
      '"get-secrets-from-user.ts"',
    ];
    for (const name of extNames) {
      expect(loaderSrc).toContain(name);
    }
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
// 8. MCP integration: mcp.json scaffolding, adapter seeding, flag injection
// ═══════════════════════════════════════════════════════════════════════════

describe("MCP integration", () => {
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

  it("cli.ts seeds pi-mcp-adapter into settings.json packages", () => {
    const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
    expect(cliSrc).toContain("npm:pi-mcp-adapter");
    expect(cliSrc).toContain("settingsManager.getGlobalSettings");
    expect(cliSrc).toContain('hasOwnProperty.call(globalSettings, "packages")');
  });

  it("cli.ts injects mcp-config flag into extension runtime", () => {
    const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
    expect(cliSrc).toContain("extensionFlagValues.set('mcp-config'");
    expect(cliSrc).toContain("KATA_MCP_CONFIG_PATH");
  });
});

describe("CLI RPC mode", () => {
  it("supports rpc mode and cwd override for Symphony RPC embedding", () => {
    const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
    expect(cliSrc).toContain("val === 'json' || val === 'text' || val === 'rpc'");
    expect(cliSrc).toContain("arg === '--cwd' && i + 1 < argv.length");
    expect(cliSrc).toContain("if (cliFlags.cwd)");
    expect(cliSrc).toContain("process.chdir(cliFlags.cwd)");
  });

  it("routes --mode rpc through runRpcMode", () => {
    const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
    expect(cliSrc).toContain("if (cliFlags.mode === 'rpc')");
    expect(cliSrc).toContain("const { runRpcMode } = await import('@mariozechner/pi-coding-agent')");
    expect(cliSrc).toContain("await runRpcMode(runtime)");
  });
});

describe("loader.ts", () => {
  it("injects --mcp-config into process.argv", () => {
    const loaderSrc = readFileSync(join(projectRoot, "src", "loader.ts"), "utf-8");
    expect(loaderSrc).toContain("--mcp-config");
    expect(loaderSrc).toContain('startsWith("--mcp-config=")');
    expect(loaderSrc).toContain("KATA_MCP_CONFIG_PATH");
    expect(loaderSrc).toContain("mcp.json");
  });
});

describe("kata startup", () => {
  it("installs pi-mcp-adapter into an isolated npm prefix", { timeout: 60_000 }, async () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-install-"));
    const fakeHome = join(tmp, "home");
    const npmPrefix = join(tmp, "npm-prefix");
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(npmPrefix, { recursive: true });

    const env = {
      ...process.env,
      HOME: fakeHome,
      npm_config_prefix: npmPrefix,
      BRAVE_API_KEY: "test",
      BRAVE_ANSWERS_KEY: "test",
      CONTEXT7_API_KEY: "test",
      JINA_API_KEY: "test",
    };

    const output = await new Promise<{ stderr: string }>((resolve) => {
      let stderr = "";
      const child = spawn("node", ["dist/loader.js"], {
        cwd: projectRoot,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.stdin.end();

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, 20000);

      child.on("close", () => {
        clearTimeout(timer);
        resolve({ stderr });
      });
    });

    const isolatedGlobalRoot = execSync("npm root -g", {
      encoding: "utf-8",
      env,
    }).trim();
    const adapterPath = join(isolatedGlobalRoot, "pi-mcp-adapter");
    expect(existsSync(adapterPath)).toBe(true);

    const pkgPath = join(adapterPath, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.pi?.extensions).toBeDefined();

    const extEntry = join(adapterPath, pkg.pi.extensions[0]);
    expect(existsSync(extEntry)).toBe(true);
  });

  it("launches and loads extensions without errors", { timeout: 60_000 }, async () => {
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const output = await new Promise<string>((resolve) => {
      let stderr = "";
      const child = spawn("node", ["dist/loader.js"], {
        cwd: projectRoot,
        env: {
          ...process.env,
          BRAVE_API_KEY: "test",
          BRAVE_ANSWERS_KEY: "test",
          CONTEXT7_API_KEY: "test",
          JINA_API_KEY: "test",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.stdin.end();

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, 5000);

      child.on("close", () => {
        clearTimeout(timer);
        resolve(stderr);
      });
    });

    expect(output).not.toContain("[kata] Extension load error");
    expect(output).not.toContain("Error: Cannot find module");
    expect(output).not.toContain("ERR_MODULE_NOT_FOUND");
  });
});
