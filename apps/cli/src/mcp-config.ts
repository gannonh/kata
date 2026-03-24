import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

type JsonObject = Record<string, unknown>;
type ProjectMcpConsentStatus = "approved" | "denied";

const PROJECT_MCP_CONSENT_VERSION = 1;
const PROJECT_MCP_CONSENT_FILE = "project-mcp-consent.json";
const EFFECTIVE_MCP_CONFIG_FILE = "mcp.effective.json";

interface ProjectMcpConsent {
  status: ProjectMcpConsentStatus;
  hash?: string;
}

interface ProjectMcpConsentStore {
  version: number;
  projects: Record<string, ProjectMcpConsent>;
}

export interface McpConfig extends JsonObject {
  imports?: string[];
  settings?: JsonObject;
  mcpServers?: JsonObject;
}

export interface ResolveEffectiveMcpConfigPathOptions {
  agentDir: string;
  appRoot: string;
  cwd: string;
  confirmProjectMcpUse?: (projectConfigPath: string) => Promise<boolean>;
  isInteractive?: boolean;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

export interface EffectiveMcpConfigResolution {
  configPath: string;
  usedProjectConfig: boolean;
  projectConfigPath: string | null;
}

export function mergeMcpConfigs(
  globalConfig: McpConfig,
  projectConfig: McpConfig,
): McpConfig {
  const globalObject = asObject(globalConfig);
  const projectObject = asObject(projectConfig);
  const globalSettings = asObject(globalObject.settings);
  const projectSettings = asObject(projectObject.settings);
  const globalServers = asObject(globalObject.mcpServers);
  const projectServers = asObject(projectObject.mcpServers);

  return {
    ...globalObject,
    ...projectObject,
    imports: [...asStringArray(globalObject.imports), ...asStringArray(projectObject.imports)],
    settings: { ...globalSettings, ...projectSettings },
    mcpServers: { ...globalServers, ...projectServers },
  };
}

export async function resolveEffectiveMcpConfigPath(
  options: ResolveEffectiveMcpConfigPathOptions,
): Promise<EffectiveMcpConfigResolution> {
  const stderr = options.stderr ?? process.stderr;
  const globalConfigPath = join(options.agentDir, "mcp.json");
  const projectConfigPath = join(options.cwd, ".kata-cli", "mcp.json");
  const fallback: EffectiveMcpConfigResolution = {
    configPath: globalConfigPath,
    usedProjectConfig: false,
    projectConfigPath: null,
  };

  if (!existsSync(projectConfigPath)) return fallback;

  const globalConfig =
    loadMcpConfig(globalConfigPath, "global", stderr, false) ?? {};
  const projectConfig = loadMcpConfig(projectConfigPath, "project", stderr, true);
  if (!projectConfig) return fallback;
  const projectConfigHash = hashObject(projectConfig);

  const consentPath = join(options.appRoot, PROJECT_MCP_CONSENT_FILE);
  const consentStore = loadProjectMcpConsentStore(consentPath, stderr);
  const consentKey = resolve(projectConfigPath);
  let consent = consentStore.projects[consentKey];
  const consentMatchesProjectConfig =
    consent?.status === "approved" && consent.hash === projectConfigHash;

  if (!consentMatchesProjectConfig && consent?.status !== "denied") {
    let approved: boolean | null = null;
    if (options.confirmProjectMcpUse) {
      approved = await options.confirmProjectMcpUse(projectConfigPath);
    } else if (
      options.isInteractive ??
      Boolean(process.stdin.isTTY && process.stdout.isTTY)
    ) {
      approved = await promptForProjectMcpUse(projectConfigPath, stderr);
    }

    if (approved === null) {
      stderr.write(
        `[kata] Project-local MCP config found at ${projectConfigPath}, but confirmation requires an interactive TTY. Using global MCP config.\n`,
      );
      return fallback;
    }

    consent = approved
      ? { status: "approved", hash: projectConfigHash }
      : { status: "denied" };
    consentStore.projects[consentKey] = consent;
    saveProjectMcpConsentStore(consentPath, consentStore, stderr);
  }

  if (consent?.status !== "approved" || consent.hash !== projectConfigHash) {
    return fallback;
  }

  const effectiveConfigPath = join(options.agentDir, EFFECTIVE_MCP_CONFIG_FILE);
  const effectiveConfig = mergeMcpConfigs(globalConfig, projectConfig);
  const serializedEffectiveConfig = `${JSON.stringify(effectiveConfig, null, 2)}\n`;
  try {
    writeIfChanged(effectiveConfigPath, serializedEffectiveConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(
      `[kata] Failed to write effective MCP config (${effectiveConfigPath}): ${message}. Using global MCP config.\n`,
    );
    return fallback;
  }

  return {
    configPath: effectiveConfigPath,
    usedProjectConfig: true,
    projectConfigPath,
  };
}

function loadMcpConfig(
  path: string,
  scope: "global" | "project",
  stderr: Pick<NodeJS.WriteStream, "write">,
  strict: boolean,
): McpConfig | null {
  if (!existsSync(path)) {
    return strict ? null : {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!isObject(parsed)) {
      throw new Error("expected top-level JSON object");
    }
    return parsed as McpConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`[kata] Invalid ${scope} MCP config at ${path}: ${message}\n`);
    return strict ? null : {};
  }
}

function loadProjectMcpConsentStore(
  path: string,
  stderr: Pick<NodeJS.WriteStream, "write">,
): ProjectMcpConsentStore {
  if (!existsSync(path)) {
    return emptyProjectMcpConsentStore();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    const parsedObject = asObject(parsed);
    const projects = asObject(parsedObject.projects);
    const normalizedProjects: Record<string, ProjectMcpConsent> = {};
    for (const [key, value] of Object.entries(projects)) {
      if (value === "approved" || value === "denied") {
        normalizedProjects[key] = { status: value };
        continue;
      }

      const consent = asObject(value);
      if (consent.status === "approved" || consent.status === "denied") {
        const normalizedConsent: ProjectMcpConsent = { status: consent.status };
        if (typeof consent.hash === "string") {
          normalizedConsent.hash = consent.hash;
        }
        normalizedProjects[key] = normalizedConsent;
      }
    }

    return {
      version:
        typeof parsedObject.version === "number"
          ? parsedObject.version
          : PROJECT_MCP_CONSENT_VERSION,
      projects: normalizedProjects,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(
      `[kata] Invalid project MCP consent store at ${path}: ${message}. Resetting consent state.\n`,
    );
    return emptyProjectMcpConsentStore();
  }
}

function saveProjectMcpConsentStore(
  path: string,
  store: ProjectMcpConsentStore,
  stderr: Pick<NodeJS.WriteStream, "write">,
): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(
      `[kata] Failed to persist project MCP consent store at ${path}: ${message}\n`,
    );
  }
}

async function promptForProjectMcpUse(
  projectConfigPath: string,
  stderr: Pick<NodeJS.WriteStream, "write"> = process.stderr,
): Promise<boolean> {
  stderr.write(
    `[kata] Project-local MCP config detected: ${projectConfigPath}\n`,
  );
  stderr.write(
    "[kata] Trust this file before Kata starts MCP servers from this project.\n",
  );

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      "[kata] Use project-local MCP config for this project? (y/N): ",
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function emptyProjectMcpConsentStore(): ProjectMcpConsentStore {
  return {
    version: PROJECT_MCP_CONSENT_VERSION,
    projects: {},
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writeIfChanged(path: string, nextContent: string): void {
  if (existsSync(path)) {
    try {
      const currentContent = readFileSync(path, "utf-8");
      if (currentContent === nextContent) return;
    } catch {
      // Fall through and overwrite unreadable/invalid content.
    }
  }
  writeFileSync(path, nextContent, "utf-8");
}

function hashObject(value: JsonObject): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
