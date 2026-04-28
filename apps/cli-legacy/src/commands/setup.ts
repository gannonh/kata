import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type HarnessKind = "codex" | "claude" | "cursor" | "pi" | "skills-sh";

export function detectHarness(env: NodeJS.ProcessEnv): HarnessKind {
  if (env.CODEX_HOME) return "codex";
  if (env.CLAUDE_CONFIG_DIR || env.CLAUDE_HOME) return "claude";
  if (env.CURSOR_CONFIG_HOME) return "cursor";
  if (env.PI_CODING_AGENT_DIR || env.PI_CONFIG_DIR || env.PI_HOME) return "pi";
  return "skills-sh";
}

export type PiAgentDirResolution =
  | "PI_CODING_AGENT_DIR"
  | "PI_CONFIG_DIR/agent"
  | "PI_HOME/agent"
  | "~/.pi/agent";

export const PI_SETUP_MARKER_FILENAME = "kata-setup-manifest.json";
export const PI_SETTINGS_FILENAME = "settings.json";
const PI_REQUIRED_SKILLS_ENTRY = "./skills";
const KATA_MANAGED_SKILL_MARKER_FILENAME = ".kata-managed-by-kata-cli";

export interface PiSetupManifest {
  schemaVersion: 1;
  installedBy: "@kata-sh/cli";
  packageVersion: string;
  harnessDetected: HarnessKind;
  agentDir: string;
  skillsDir: string;
  skillsSourceDir: string;
  firstInstalledAt: string;
  installedAt: string;
  managedSkillEntries?: string[];
}

export interface SetupSuccessResult {
  ok: true;
  harness: HarnessKind;
  mode: "lightweight" | "pi-install";
  message: string;
  pi?: {
    agentDir: string;
    skillsDir: string;
    skillsSourceDir: string;
    markerPath: string;
    markerWritten: true;
    settingsPath: string;
    settingsWritten: true;
    agentDirResolution: PiAgentDirResolution;
  };
}

export interface SetupErrorResult {
  ok: false;
  harness: HarnessKind;
  mode: "pi-install";
  error: {
    code: "SKILLS_SOURCE_MISSING" | "SETUP_FAILED";
    message: string;
  };
}

export type SetupResult = SetupSuccessResult | SetupErrorResult;

export interface RunSetupInput {
  pi?: boolean;
  env?: NodeJS.ProcessEnv;
  packageVersion?: string;
  now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnvPath(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolvePiAgentDir(
  env: NodeJS.ProcessEnv = process.env,
): { path: string; resolution: PiAgentDirResolution } {
  const fromPiCodingAgentDir = readEnvPath(env.PI_CODING_AGENT_DIR);
  if (fromPiCodingAgentDir) {
    return { path: fromPiCodingAgentDir, resolution: "PI_CODING_AGENT_DIR" };
  }

  const fromPiConfigDir = readEnvPath(env.PI_CONFIG_DIR);
  if (fromPiConfigDir) {
    return {
      path: join(fromPiConfigDir, "agent"),
      resolution: "PI_CONFIG_DIR/agent",
    };
  }

  const fromPiHome = readEnvPath(env.PI_HOME);
  if (fromPiHome) {
    return {
      path: join(fromPiHome, "agent"),
      resolution: "PI_HOME/agent",
    };
  }

  return {
    path: join(readEnvPath(env.HOME) ?? homedir(), ".pi", "agent"),
    resolution: "~/.pi/agent",
  };
}

export function resolveBundledSkillsDir(
  env: NodeJS.ProcessEnv = process.env,
): { path: string; exists: boolean; resolution: "KATA_CLI_SKILLS_SOURCE_DIR" | "bundled-default" } {
  const override = readEnvPath(env.KATA_CLI_SKILLS_SOURCE_DIR);
  if (override) {
    return {
      path: override,
      exists: existsSync(override),
      resolution: "KATA_CLI_SKILLS_SOURCE_DIR",
    };
  }

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "..", "resources", "skills"),
    resolve(thisDir, "..", "..", "src", "resources", "skills"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;

  return {
    path,
    exists: existsSync(path),
    resolution: "bundled-default",
  };
}

async function copyDirectoryContents(sourceDir: string, destinationDir: string): Promise<string[]> {
  await mkdir(destinationDir, { recursive: true });
  const entries = (await readdir(sourceDir)).sort();

  for (const entryName of entries) {
    await cp(join(sourceDir, entryName), join(destinationDir, entryName), {
      recursive: true,
      force: true,
    });
  }

  return entries;
}

async function markManagedSkillEntries(skillsDir: string, managedEntries: string[]): Promise<void> {
  for (const entryName of managedEntries) {
    const entryPath = join(skillsDir, entryName);
    const entryStats = await stat(entryPath);
    if (!entryStats.isDirectory()) continue;
    await writeFile(
      join(entryPath, KATA_MANAGED_SKILL_MARKER_FILENAME),
      "@kata-sh/cli\n",
      "utf8",
    );
  }
}

async function pruneRemovedManagedSkills(
  skillsDir: string,
  previousManagedEntries: unknown[],
  currentManagedEntries: string[],
): Promise<void> {
  const currentManagedEntrySet = new Set(currentManagedEntries);
  for (const previousEntry of previousManagedEntries) {
    if (typeof previousEntry !== "string") continue;
    const normalizedEntry = previousEntry.trim();
    if (normalizedEntry.length === 0) continue;
    if (
      normalizedEntry.includes("/") ||
      normalizedEntry.includes("\\") ||
      normalizedEntry === "." ||
      normalizedEntry === ".."
    ) {
      continue;
    }
    if (currentManagedEntrySet.has(normalizedEntry)) continue;
    const previousEntryPath = join(skillsDir, normalizedEntry);
    const managedMarkerPath = join(previousEntryPath, KATA_MANAGED_SKILL_MARKER_FILENAME);
    if (!existsSync(managedMarkerPath)) continue;
    await rm(previousEntryPath, { recursive: true, force: true });
  }
}

async function writeJsonIfChanged(path: string, value: Record<string, unknown>): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await readFile(path, "utf8");
    if (existing === serialized) return;
  } catch {
    // Missing file or unreadable content; overwrite with canonical output.
  }
  await writeFile(path, serialized, "utf8");
}

async function upsertPiSettings(agentDir: string): Promise<{ settingsPath: string }> {
  const settingsPath = join(agentDir, PI_SETTINGS_FILENAME);
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    const settingsContent = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(settingsContent);
    if (!isRecord(parsed)) {
      throw new Error(`Pi settings must be a JSON object: ${settingsPath}`);
    }
    settings = parsed;
  }

  const existingSkillsValue = settings.skills;
  if (existingSkillsValue !== undefined && !Array.isArray(existingSkillsValue)) {
    throw new Error(`Pi settings field "skills" must be an array: ${settingsPath}`);
  }

  const normalizedSkills = Array.isArray(existingSkillsValue)
    ? existingSkillsValue.filter((entry): entry is string => typeof entry === "string")
    : [];

  const hasRequiredSkillsEntry = normalizedSkills.some((entry) =>
    entry === PI_REQUIRED_SKILLS_ENTRY || entry === "skills"
  );
  if (!hasRequiredSkillsEntry) {
    normalizedSkills.push(PI_REQUIRED_SKILLS_ENTRY);
  }

  settings = {
    ...settings,
    skills: normalizedSkills,
    enableSkillCommands: true,
  };

  await writeJsonIfChanged(settingsPath, settings);
  return { settingsPath };
}

async function readExistingManifest(markerPath: string): Promise<PiSetupManifest | null> {
  try {
    const content = await readFile(markerPath, "utf8");
    const parsed = JSON.parse(content) as Partial<PiSetupManifest>;
    if (parsed && parsed.schemaVersion === 1 && typeof parsed.firstInstalledAt === "string") {
      return parsed as PiSetupManifest;
    }
  } catch {
    // Ignore malformed/absent manifests; setup will rewrite it.
  }
  return null;
}

export async function runSetup(input: RunSetupInput = {}): Promise<SetupResult> {
  const env = input.env ?? process.env;
  const harness = detectHarness(env);

  if (!input.pi) {
    return {
      ok: true,
      harness,
      mode: "lightweight",
      message: harness === "pi"
        ? "Pi harness detected. Run `kata setup --pi` to install bundled skills."
        : "Setup completed (no harness-specific install requested).",
    };
  }

  const source = resolveBundledSkillsDir(env);
  if (!source.exists) {
    return {
      ok: false,
      harness,
      mode: "pi-install",
      error: {
        code: "SKILLS_SOURCE_MISSING",
        message: `Bundled skills directory not found at ${source.path}.`,
      },
    };
  }

  try {
    const sourceStats = await stat(source.path);
    if (!sourceStats.isDirectory()) {
      return {
        ok: false,
        harness,
        mode: "pi-install",
        error: {
          code: "SKILLS_SOURCE_MISSING",
          message: `Bundled skills path is not a directory: ${source.path}.`,
        },
      };
    }

    const agentDir = resolvePiAgentDir(env);
    const skillsDir = join(agentDir.path, "skills");
    await mkdir(agentDir.path, { recursive: true });

    const markerPath = join(agentDir.path, PI_SETUP_MARKER_FILENAME);
    const now = (input.now ?? new Date()).toISOString();
    const existing = await readExistingManifest(markerPath);
    const copiedSkillEntries = await copyDirectoryContents(source.path, skillsDir);
    await markManagedSkillEntries(skillsDir, copiedSkillEntries);
    await pruneRemovedManagedSkills(
      skillsDir,
      Array.isArray(existing?.managedSkillEntries) ? existing.managedSkillEntries : [],
      copiedSkillEntries,
    );
    const { settingsPath } = await upsertPiSettings(agentDir.path);

    const manifest: PiSetupManifest = {
      schemaVersion: 1,
      installedBy: "@kata-sh/cli",
      packageVersion: input.packageVersion ?? existing?.packageVersion ?? "0.0.0-dev",
      harnessDetected: harness,
      agentDir: agentDir.path,
      skillsDir,
      skillsSourceDir: source.path,
      firstInstalledAt: existing?.firstInstalledAt ?? now,
      installedAt: now,
      managedSkillEntries: copiedSkillEntries,
    };

    await writeFile(markerPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return {
      ok: true,
      harness,
      mode: "pi-install",
      message: "Pi setup completed. Bundled skills are installed and ready to use.",
      pi: {
        agentDir: agentDir.path,
        skillsDir,
        skillsSourceDir: source.path,
        markerPath,
        markerWritten: true,
        settingsPath,
        settingsWritten: true,
        agentDirResolution: agentDir.resolution,
      },
    };
  } catch (error) {
    return {
      ok: false,
      harness,
      mode: "pi-install",
      error: {
        code: "SETUP_FAILED",
        message: error instanceof Error ? error.message : "Unexpected setup failure",
      },
    };
  }
}
