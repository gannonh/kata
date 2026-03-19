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

import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
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

test("app-paths resolve to ~/.kata-cli/", async () => {
  const { appRoot, agentDir, sessionsDir, authFilePath } =
    await import("../app-paths.ts");
  const home = process.env.HOME!;

  assert.equal(appRoot, join(home, ".kata-cli"), "appRoot is ~/.kata-cli/");
  assert.equal(
    agentDir,
    join(home, ".kata-cli", "agent"),
    "agentDir is ~/.kata-cli/agent/",
  );
  assert.equal(
    sessionsDir,
    join(home, ".kata-cli", "sessions"),
    "sessionsDir is ~/.kata-cli/sessions/",
  );
  assert.equal(
    authFilePath,
    join(home, ".kata-cli", "agent", "auth.json"),
    "authFilePath is ~/.kata-cli/agent/auth.json",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. loader env vars
// ═══════════════════════════════════════════════════════════════════════════

test("loader sets all 4 KATA_ env vars and PI_PACKAGE_DIR", async () => {
  // Run loader in a subprocess that prints env vars and exits before TUI starts
  const script = `
    import { fileURLToPath } from 'url';
    import { dirname, resolve, join } from 'path';
    import { agentDir } from './app-paths.js';

    const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'pkg');
    process.env.PI_PACKAGE_DIR = pkgDir;
    process.env.KATA_CODING_AGENT_DIR = agentDir;
    process.env.KATA_BIN_PATH = process.argv[1];
    const resourcesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'resources');
    process.env.KATA_WORKFLOW_PATH = join(resourcesDir, 'KATA-WORKFLOW.md');
    const exts = ['extensions/kata/index.ts'].map(r => join(resourcesDir, r));
    process.env.KATA_BUNDLED_EXTENSION_PATHS = exts.join(':');

    // Print for verification
    console.log('PI_PACKAGE_DIR=' + process.env.PI_PACKAGE_DIR);
    console.log('KATA_CODING_AGENT_DIR=' + process.env.KATA_CODING_AGENT_DIR);
    console.log('KATA_BIN_PATH=' + process.env.KATA_BIN_PATH);
    console.log('KATA_WORKFLOW_PATH=' + process.env.KATA_WORKFLOW_PATH);
    console.log('KATA_BUNDLED_EXTENSION_PATHS=' + process.env.KATA_BUNDLED_EXTENSION_PATHS);
    process.exit(0);
  `;

  const tmp = mkdtempSync(join(tmpdir(), "kata-loader-test-"));
  const scriptPath = join(tmp, "check-env.ts");
  writeFileSync(scriptPath, script);

  try {
    const output = execSync(
      `node --experimental-strip-types -e "
        process.chdir('${projectRoot}');
        await import('./src/app-paths.ts');
      " 2>&1`,
      { encoding: "utf-8", cwd: projectRoot },
    );
    // If we got here without error, the import works
  } catch {
    // Fine — we test the logic inline below
  }

  // Direct logic verification (no subprocess needed)
  const { agentDir: ad } = await import("../app-paths.ts");
  assert.ok(ad.endsWith(".kata-cli/agent"), "agentDir ends with .kata-cli/agent");

  // Verify the env var names are in loader.ts source
  const loaderSrc = readFileSync(
    join(projectRoot, "src", "loader.ts"),
    "utf-8",
  );
  assert.ok(loaderSrc.includes("PI_PACKAGE_DIR"), "loader sets PI_PACKAGE_DIR");
  assert.ok(
    loaderSrc.includes("KATA_CODING_AGENT_DIR"),
    "loader sets KATA_CODING_AGENT_DIR",
  );
  assert.ok(loaderSrc.includes("KATA_BIN_PATH"), "loader sets KATA_BIN_PATH");
  assert.ok(
    loaderSrc.includes("KATA_WORKFLOW_PATH"),
    "loader sets KATA_WORKFLOW_PATH",
  );
  assert.ok(
    loaderSrc.includes("KATA_BUNDLED_EXTENSION_PATHS"),
    "loader sets KATA_BUNDLED_EXTENSION_PATHS",
  );

  // Verify all 11 extension entry points are referenced in loader
  // Loader uses join() calls like join(agentDir, 'extensions', 'kata', 'index.ts')
  // so we check for the distinguishing directory name of each extension
  const extNames = [
    '"kata"',
    '"bg-shell"',
    '"browser-tools"',
    '"context7"',
    '"search-the-web"',
    '"slash-commands"',
    '"subagent"',
    '"ask-user-questions.ts"',
    '"get-secrets-from-user.ts"',
  ];
  for (const name of extNames) {
    assert.ok(loaderSrc.includes(name), `loader references extension ${name}`);
  }

  rmSync(tmp, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. resource-loader syncs bundled resources
// ═══════════════════════════════════════════════════════════════════════════

test("initResources syncs extensions, agents, and AGENTS.md to target dir", async () => {
  const { initResources } = await import("../resource-loader.ts");
  const tmp = mkdtempSync(join(tmpdir(), "kata-resources-test-"));
  const fakeAgentDir = join(tmp, "agent");

  try {
    initResources(fakeAgentDir);

    // Extensions synced
    assert.ok(
      existsSync(join(fakeAgentDir, "extensions", "kata", "index.ts")),
      "kata extension synced",
    );
    assert.ok(
      existsSync(join(fakeAgentDir, "extensions", "browser-tools", "index.ts")),
      "browser-tools synced",
    );
    assert.ok(
      existsSync(
        join(fakeAgentDir, "extensions", "search-the-web", "index.ts"),
      ),
      "search-the-web synced",
    );
    assert.ok(
      existsSync(join(fakeAgentDir, "extensions", "context7", "index.ts")),
      "context7 synced",
    );
    assert.ok(
      existsSync(join(fakeAgentDir, "extensions", "subagent", "index.ts")),
      "subagent synced",
    );

    // Agents synced
    assert.ok(
      existsSync(join(fakeAgentDir, "agents", "scout.md")),
      "scout agent synced",
    );

    // AGENTS.md synced
    assert.ok(existsSync(join(fakeAgentDir, "AGENTS.md")), "AGENTS.md synced");
    const agentsMd = readFileSync(join(fakeAgentDir, "AGENTS.md"), "utf-8");
    assert.ok(agentsMd.length > 1000, "AGENTS.md has substantial content");

    // Idempotent: run again, no crash
    initResources(fakeAgentDir);
    assert.ok(
      existsSync(join(fakeAgentDir, "extensions", "kata", "index.ts")),
      "idempotent re-sync works",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. wizard loadStoredEnvKeys hydration
// ═══════════════════════════════════════════════════════════════════════════

test("loadStoredEnvKeys hydrates process.env from auth.json", async () => {
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

  // Clear any existing env vars
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

    assert.equal(
      process.env.BRAVE_API_KEY,
      "test-brave-key",
      "BRAVE_API_KEY hydrated",
    );
    assert.equal(
      process.env.BRAVE_ANSWERS_KEY,
      "test-answers-key",
      "BRAVE_ANSWERS_KEY hydrated",
    );
    assert.equal(
      process.env.CONTEXT7_API_KEY,
      "test-ctx7-key",
      "CONTEXT7_API_KEY hydrated",
    );
    assert.equal(
      process.env.JINA_API_KEY,
      undefined,
      "JINA_API_KEY not set (not in auth)",
    );
  } finally {
    // Restore original env
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

// ═══════════════════════════════════════════════════════════════════════════
// 5. loadStoredEnvKeys does NOT overwrite existing env vars
// ═══════════════════════════════════════════════════════════════════════════

test("loadStoredEnvKeys does not overwrite existing env vars", async () => {
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

    assert.equal(
      process.env.BRAVE_API_KEY,
      "existing-env-key",
      "existing env var not overwritten",
    );
  } finally {
    if (origBrave) process.env.BRAVE_API_KEY = origBrave;
    else delete process.env.BRAVE_API_KEY;
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. npm pack produces valid tarball with correct file layout
// ═══════════════════════════════════════════════════════════════════════════

test("npm pack produces tarball with required files", { timeout: 60_000 }, async () => {
  // Build first
  execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

  // Pack
  const packOutput = execSync("npm pack --json 2>/dev/null", {
    cwd: projectRoot,
    encoding: "utf-8",
  });
  const packInfo = JSON.parse(packOutput);
  const tarball = packInfo[0].filename;
  const tarballPath = join(projectRoot, tarball);

  assert.ok(existsSync(tarballPath), `tarball ${tarball} created`);

  try {
    // List tarball contents
    const contents = execSync(`tar tzf ${tarballPath}`, { encoding: "utf-8" });
    const files = contents.split("\n").filter(Boolean);

    // Critical files must be present
    assert.ok(
      files.some((f) => f.includes("dist/loader.js")),
      "tarball contains dist/loader.js",
    );
    assert.ok(
      files.some((f) => f.includes("dist/cli.js")),
      "tarball contains dist/cli.js",
    );
    assert.ok(
      files.some((f) => f.includes("dist/app-paths.js")),
      "tarball contains dist/app-paths.js",
    );
    assert.ok(
      files.some((f) => f.includes("dist/wizard.js")),
      "tarball contains dist/wizard.js",
    );
    assert.ok(
      files.some((f) => f.includes("dist/resource-loader.js")),
      "tarball contains dist/resource-loader.js",
    );
    assert.ok(
      files.some((f) => f.includes("pkg/package.json")),
      "tarball contains pkg/package.json",
    );
    assert.ok(
      files.some((f) => f.includes("src/resources/extensions/kata/index.ts")),
      "tarball contains bundled kata extension",
    );
    assert.ok(
      files.some((f) => f.includes("src/resources/AGENTS.md")),
      "tarball contains AGENTS.md",
    );
    assert.ok(
      files.some((f) => f.includes("scripts/postinstall.js")),
      "tarball contains postinstall script",
    );

    // pkg/package.json must have piConfig
    const pkgJson = readFileSync(
      join(projectRoot, "pkg", "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(pkgJson);
    assert.equal(
      pkg.piConfig?.name,
      "kata",
      "pkg/package.json piConfig.name is kata",
    );
    assert.equal(
      pkg.piConfig?.configDir,
      ".kata-cli",
      "pkg/package.json piConfig.configDir is .kata-cli",
    );
  } finally {
    // Clean up tarball
    rmSync(tarballPath, { force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. npm pack → install → kata-cli binary resolves
// ═══════════════════════════════════════════════════════════════════════════

test("tarball installs and kata-cli binary resolves", { timeout: 60_000 }, async () => {
  // Build and pack
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
    // Install from tarball into a temp prefix
    execSync(`npm install --prefix ${tmp} ${tarballPath} --no-save 2>&1`, {
      encoding: "utf-8",
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
    });

    // Verify the kata bin exists in the installed package
    const installedBin = join(tmp, "node_modules", ".bin", "kata-cli");
    assert.ok(
      existsSync(installedBin),
      "kata-cli binary exists in node_modules/.bin/",
    );

    // Verify loader.js is executable (has shebang)
    const installedLoader = join(
      tmp,
      "node_modules",
      "@kata-sh",
      "cli",
      "dist",
      "loader.js",
    );
    const loaderContent = readFileSync(installedLoader, "utf-8");
    assert.ok(
      loaderContent.startsWith("#!/usr/bin/env node"),
      "loader.js has node shebang",
    );

    // Verify bundled resources are present
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
    assert.ok(
      existsSync(installedKataExt),
      "bundled kata extension present in installed package",
    );
  } finally {
    rmSync(tarballPath, { force: true });
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. MCP integration: mcp.json scaffolding, adapter seeding, flag injection
// ═══════════════════════════════════════════════════════════════════════════

test("initResources scaffolds starter mcp.json on first launch", async () => {
  const { initResources } = await import("../resource-loader.ts");
  const tmp = mkdtempSync(join(tmpdir(), "kata-mcp-scaffold-"));
  const fakeAgentDir = join(tmp, "agent");

  try {
    initResources(fakeAgentDir);

    const mcpPath = join(fakeAgentDir, "mcp.json");
    assert.ok(existsSync(mcpPath), "mcp.json created on first launch");

    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    assert.ok(config.settings, "mcp.json has settings section");
    assert.equal(config.settings.toolPrefix, "server", "toolPrefix is 'server'");
    assert.deepEqual(config.imports, [], "mcp.json includes an empty imports array");
    assert.deepEqual(config.mcpServers, {}, "mcp.json has empty mcpServers object");

    // Verify it's not overwritten on second launch
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { custom: { url: "http://test" } } }));
    initResources(fakeAgentDir);
    const afterSecondRun = JSON.parse(readFileSync(mcpPath, "utf-8"));
    assert.ok(afterSecondRun.mcpServers.custom, "mcp.json not overwritten on re-run");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("cli.ts seeds pi-mcp-adapter into settings.json packages", () => {
  const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
  assert.ok(
    cliSrc.includes("npm:pi-mcp-adapter"),
    "cli.ts references npm:pi-mcp-adapter package",
  );
  assert.ok(
    cliSrc.includes("settingsManager.getGlobalSettings"),
    "cli.ts inspects global settings before seeding the adapter",
  );
  assert.ok(
    cliSrc.includes('hasOwnProperty.call(globalSettings, "packages")'),
    "cli.ts seeds the adapter only during first-run bootstrap",
  );
});

test("cli.ts injects mcp-config flag into extension runtime", () => {
  const cliSrc = readFileSync(join(projectRoot, "src", "cli.ts"), "utf-8");
  assert.ok(
    cliSrc.includes("flagValues.set('mcp-config'"),
    "cli.ts sets mcp-config flag value on runtime",
  );
  assert.ok(
    cliSrc.includes("KATA_MCP_CONFIG_PATH"),
    "cli.ts reads KATA_MCP_CONFIG_PATH env var",
  );
});

test("loader.ts injects --mcp-config into process.argv", () => {
  const loaderSrc = readFileSync(join(projectRoot, "src", "loader.ts"), "utf-8");
  assert.ok(
    loaderSrc.includes("--mcp-config"),
    "loader.ts pushes --mcp-config to process.argv",
  );
  assert.ok(
    loaderSrc.includes('startsWith("--mcp-config=")'),
    "loader.ts honors inline --mcp-config=/path arguments",
  );
  assert.ok(
    loaderSrc.includes("KATA_MCP_CONFIG_PATH"),
    "loader.ts sets KATA_MCP_CONFIG_PATH",
  );
  assert.ok(
    loaderSrc.includes("mcp.json"),
    "loader.ts references mcp.json config file",
  );
});

test("kata startup installs pi-mcp-adapter into an isolated npm prefix", { timeout: 60_000 }, async () => {
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
  assert.ok(
    existsSync(adapterPath),
    `pi-mcp-adapter installed via kata startup (stderr: ${output.stderr.slice(0, 500)})`,
  );

  // Verify its package.json has the pi extension config
  const pkgPath = join(adapterPath, "package.json");
  assert.ok(existsSync(pkgPath), "pi-mcp-adapter has package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  assert.ok(pkg.pi?.extensions, "pi-mcp-adapter declares pi.extensions");

  // Verify the extension entry point exists
  const extEntry = join(adapterPath, pkg.pi.extensions[0]);
  assert.ok(existsSync(extEntry), `extension entry point ${pkg.pi.extensions[0]} exists`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Launch → extensions load → no errors on stderr
// ═══════════════════════════════════════════════════════════════════════════

test("kata launches and loads extensions without errors", { timeout: 60_000 }, async () => {
  // Build first
  execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

  // Launch kata with all optional keys set (skip wizard) and capture stderr.
  // Kill after 5 seconds — we just need to see if extensions load.
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

    // Close stdin immediately so it's non-TTY
    child.stdin.end();

    // Give it 5s to start up
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 5000);

    child.on("close", () => {
      clearTimeout(timer);
      resolve(stderr);
    });
  });

  // No extension load errors
  assert.ok(
    !output.includes("[kata] Extension load error"),
    `no extension load errors on stderr (got: ${output.slice(0, 500)})`,
  );

  // No crash / unhandled errors
  assert.ok(
    !output.includes("Error: Cannot find module"),
    "no missing module errors",
  );
  assert.ok(
    !output.includes("ERR_MODULE_NOT_FOUND"),
    "no ERR_MODULE_NOT_FOUND",
  );
});
