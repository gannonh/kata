import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";

const execFileAsync = promisify(execFile);

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
export type SkillsSourceResolution = "cli-workspace" | "bundled-package";
export type SetupInstallTargetKind = "local-agents" | "global-agents" | "cursor" | "claude" | "pi";

export interface SetupManifest {
  schemaVersion: 1;
  installedBy: "@kata-sh/cli";
  packageVersion: string;
  harnessDetected: HarnessKind;
  targetKind: SetupInstallTargetKind;
  targetDir: string;
  skillsDir: string;
  skillsSourceDir: string;
  firstInstalledAt: string;
  installedAt: string;
  managedSkillEntries?: string[];
}

export interface PiSetupManifest extends SetupManifest {
  targetKind: "pi";
  agentDir: string;
}

export interface SetupInstallTargetResult {
  kind: SetupInstallTargetKind;
  targetDir: string;
  skillsDir: string;
  skillsSourceDir: string;
  markerPath: string;
  markerWritten: true;
  skillsSourceResolution: SkillsSourceResolution;
  installedEntries: string[];
  settingsPath?: string;
  settingsWritten?: true;
  agentDirResolution?: PiAgentDirResolution;
}

export interface SetupPreferencesResult {
  path: string;
  status: "existing" | "created";
  backend?: "github";
  repoOwner?: string;
  repoName?: string;
  githubProjectNumber?: number;
}

export interface SetupSuccessResult {
  ok: true;
  harness: HarnessKind;
  mode: "lightweight" | "setup" | "pi-install";
  message: string;
  preferences?: SetupPreferencesResult;
  targets?: SetupInstallTargetResult[];
  pi?: {
    agentDir: string;
    skillsDir: string;
    skillsSourceDir: string;
    markerPath: string;
    markerWritten: true;
    settingsPath: string;
    settingsWritten: true;
    agentDirResolution: PiAgentDirResolution;
    skillsSourceResolution: SkillsSourceResolution;
  };
}

export interface SetupErrorResult {
  ok: false;
  harness: HarnessKind;
  mode: "setup" | "pi-install";
  error: {
    code: "SKILLS_SOURCE_MISSING" | "SETUP_FAILED" | "NON_INTERACTIVE_SETUP_REQUIRED" | "GITHUB_AUTH_MISSING" | "INVALID_INPUT";
    message: string;
  };
}

export type SetupResult = SetupSuccessResult | SetupErrorResult;

export interface SetupOnboardingInput {
  backend?: "github" | "linear";
  repoOwner?: string;
  repoName?: string;
  githubProjectNumber?: number;
}

export interface RunSetupInput {
  pi?: boolean;
  local?: boolean;
  global?: boolean;
  cursor?: boolean;
  claude?: boolean;
  env?: NodeJS.ProcessEnv;
  packageVersion?: string;
  now?: Date;
  cwd?: string;
  interactive?: boolean;
  onboarding?: SetupOnboardingInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnvPath(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanString(value: string | undefined): string | null {
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

function findMonorepoRoot(startingPath: string): string | null {
  let current = resolve(startingPath);
  while (true) {
    if (
      existsSync(join(current, "pnpm-workspace.yaml")) &&
      existsSync(join(current, "apps", "cli"))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveSkillsSource(
  cwd: string = process.cwd(),
): { path: string; exists: boolean; resolution: SkillsSourceResolution } {
  const monorepoRoot = findMonorepoRoot(cwd);
  if (monorepoRoot) {
    const cliSkills = join(monorepoRoot, "apps", "cli", "skills");
    return {
      path: cliSkills,
      exists: existsSync(cliSkills),
      resolution: "cli-workspace",
    };
  }

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "..", "..", "skills"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;

  return {
    path,
    exists: existsSync(path),
    resolution: "bundled-package",
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

async function readExistingManifest(markerPath: string): Promise<SetupManifest | null> {
  try {
    const content = await readFile(markerPath, "utf8");
    const parsed = JSON.parse(content) as Partial<SetupManifest>;
    if (parsed && parsed.schemaVersion === 1 && typeof parsed.firstInstalledAt === "string") {
      return parsed as SetupManifest;
    }
  } catch {
    // Ignore malformed/absent manifests; setup will rewrite it.
  }
  return null;
}

function parseGithubRemoteUrl(remoteUrl: string): { owner: string; name: string } | null {
  const trimmed = remoteUrl.trim();
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch) {
    return { owner: sshMatch[1]!, name: sshMatch[2]! };
  }

  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, name: httpsMatch[2]! };
  }

  return null;
}

async function inferGithubRepository(cwd: string): Promise<{ owner: string; name: string } | null> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
      cwd,
      timeout: 3000,
    });
    return parseGithubRemoteUrl(stdout);
  } catch {
    return null;
  }
}

async function hasGithubAuth(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (cleanString(env.GITHUB_TOKEN) || cleanString(env.GH_TOKEN)) return true;
  try {
    await execFileAsync("gh", ["auth", "status"], { env, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function renderGithubPreferences(input: {
  repoOwner: string;
  repoName: string;
  githubProjectNumber: number;
}): string {
  return `---\nworkflow:\n  mode: github\ngithub:\n  repoOwner: ${input.repoOwner}\n  repoName: ${input.repoName}\n  stateMode: projects_v2\n  githubProjectNumber: ${input.githubProjectNumber}\n---\n`;
}

async function askRequired(question: (prompt: string) => Promise<string>, label: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  while (true) {
    const answer = (await question(`${label}${suffix}: `)).trim();
    const value = answer.length > 0 ? answer : defaultValue;
    if (value && value.trim().length > 0) return value.trim();
  }
}

async function askPositiveInteger(
  question: (prompt: string) => Promise<string>,
  label: string,
  defaultValue?: number,
): Promise<number> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  while (true) {
    const answer = (await question(`${label}${suffix}: `)).trim();
    const value = answer.length > 0 ? Number(answer) : defaultValue;
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  }
}

function hasCompleteGithubOnboarding(input: SetupOnboardingInput | undefined): input is Required<Pick<SetupOnboardingInput, "repoOwner" | "repoName" | "githubProjectNumber">> & SetupOnboardingInput {
  return Boolean(
    cleanString(input?.repoOwner) &&
    cleanString(input?.repoName) &&
    typeof input?.githubProjectNumber === "number" &&
    Number.isInteger(input.githubProjectNumber) &&
    input.githubProjectNumber > 0,
  );
}

async function ensurePreferences(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  interactive: boolean;
  onboarding?: SetupOnboardingInput;
}): Promise<SetupPreferencesResult> {
  const preferencesPath = join(input.cwd, ".kata", "preferences.md");
  if (existsSync(preferencesPath)) {
    return { path: preferencesPath, status: "existing" };
  }

  if (!(await hasGithubAuth(input.env))) {
    throw Object.assign(new Error("GitHub auth is required before creating .kata/preferences.md. Run `gh auth login` or set GITHUB_TOKEN/GH_TOKEN."), {
      code: "GITHUB_AUTH_MISSING",
    });
  }

  let repoOwner = cleanString(input.onboarding?.repoOwner) ?? undefined;
  let repoName = cleanString(input.onboarding?.repoName) ?? undefined;
  let githubProjectNumber = input.onboarding?.githubProjectNumber;

  if (!hasCompleteGithubOnboarding(input.onboarding)) {
    if (!input.interactive) {
      throw Object.assign(new Error("Interactive setup is required to create .kata/preferences.md. Rerun in a TTY or pass repo owner, repo name, and GitHub Project number."), {
        code: "NON_INTERACTIVE_SETUP_REQUIRED",
      });
    }

    const inferredRepository = await inferGithubRepository(input.cwd);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const backend = (await rl.question("Kata backend [github]: ")).trim().toLowerCase() || "github";
      if (backend !== "github") {
        throw Object.assign(new Error("Only GitHub setup is available in this CLI build. Linear setup is coming later."), {
          code: "INVALID_INPUT",
        });
      }

      repoOwner = await askRequired(rl.question.bind(rl), "GitHub repo owner", repoOwner ?? inferredRepository?.owner);
      repoName = await askRequired(rl.question.bind(rl), "GitHub repo name", repoName ?? inferredRepository?.name);
      githubProjectNumber = await askPositiveInteger(rl.question.bind(rl), "GitHub Project number", githubProjectNumber);
    } finally {
      rl.close();
    }
  }

  const normalizedRepoOwner = cleanString(repoOwner);
  const normalizedRepoName = cleanString(repoName);
  if (!normalizedRepoOwner || !normalizedRepoName || !githubProjectNumber || !Number.isInteger(githubProjectNumber) || githubProjectNumber <= 0) {
    throw Object.assign(new Error("GitHub setup requires repo owner, repo name, and a positive GitHub Project number."), {
      code: "INVALID_INPUT",
    });
  }

  await mkdir(dirname(preferencesPath), { recursive: true });
  await writeFile(
    preferencesPath,
    renderGithubPreferences({
      repoOwner: normalizedRepoOwner,
      repoName: normalizedRepoName,
      githubProjectNumber,
    }),
    "utf8",
  );

  return {
    path: preferencesPath,
    status: "created",
    backend: "github",
    repoOwner: normalizedRepoOwner,
    repoName: normalizedRepoName,
    githubProjectNumber,
  };
}

function explicitTargetKinds(input: RunSetupInput): SetupInstallTargetKind[] {
  const selected: SetupInstallTargetKind[] = [];
  if (input.local) selected.push("local-agents");
  if (input.global) selected.push("global-agents");
  if (input.cursor) selected.push("cursor");
  if (input.claude) selected.push("claude");
  if (input.pi) selected.push("pi");
  return selected;
}

async function askYesNo(
  question: (prompt: string) => Promise<string>,
  label: string,
  defaultValue: boolean,
): Promise<boolean> {
  const suffix = defaultValue ? " [Y/n]" : " [y/N]";
  while (true) {
    const answer = (await question(`${label}${suffix}: `)).trim().toLowerCase();
    if (answer.length === 0) return defaultValue;
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;
  }
}

async function askInstallScope(question: (prompt: string) => Promise<string>): Promise<"local" | "global"> {
  while (true) {
    const answer = (await question("Install skills globally or local to this project? [local/global] (local): ")).trim().toLowerCase();
    if (answer.length === 0 || answer === "local" || answer === "l") return "local";
    if (answer === "global" || answer === "g") return "global";
  }
}

async function resolveTargetKinds(input: RunSetupInput & { interactive: boolean }): Promise<SetupInstallTargetKind[]> {
  const explicit = explicitTargetKinds(input);
  if (explicit.length > 0 || !input.interactive) {
    return explicit.length > 0 ? explicit : ["local-agents"];
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const selected: SetupInstallTargetKind[] = [];
    const scope = await askInstallScope(rl.question.bind(rl));
    const agentsPrompt = scope === "global" ? "Install skills to ~/.agents" : "Install skills to .agents";

    if (await askYesNo(rl.question.bind(rl), agentsPrompt, true)) {
      selected.push(scope === "global" ? "global-agents" : "local-agents");
    }

    if (scope === "local" && await askYesNo(rl.question.bind(rl), "Install Claude Code skills to .claude/skills", false)) {
      selected.push("claude");
    }

    if (scope === "local" && await askYesNo(rl.question.bind(rl), "Install Cursor skills to .cursor/skills", false)) {
      selected.push("cursor");
    }

    if (input.pi) {
      selected.push("pi");
    }
    return selected.length > 0 ? selected : [scope === "global" ? "global-agents" : "local-agents"];
  } finally {
    rl.close();
  }
}

function resolveInstallTarget(input: {
  kind: SetupInstallTargetKind;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): { kind: SetupInstallTargetKind; targetDir: string; skillsDir: string; agentDirResolution?: PiAgentDirResolution } {
  if (input.kind === "local-agents") {
    const targetDir = join(input.cwd, ".agents");
    return { kind: input.kind, targetDir, skillsDir: join(targetDir, "skills") };
  }

  if (input.kind === "global-agents") {
    const targetDir = join(readEnvPath(input.env.HOME) ?? homedir(), ".agents");
    return { kind: input.kind, targetDir, skillsDir: join(targetDir, "skills") };
  }

  if (input.kind === "cursor") {
    const targetDir = join(input.cwd, ".cursor");
    return { kind: input.kind, targetDir, skillsDir: join(targetDir, "skills") };
  }

  if (input.kind === "claude") {
    const targetDir = join(input.cwd, ".claude");
    return { kind: input.kind, targetDir, skillsDir: join(targetDir, "skills") };
  }

  const agentDir = resolvePiAgentDir(input.env);
  return {
    kind: input.kind,
    targetDir: agentDir.path,
    skillsDir: join(agentDir.path, "skills"),
    agentDirResolution: agentDir.resolution,
  };
}

async function upsertGitignoreEntries(cwd: string, entries: string[]): Promise<void> {
  if (entries.length === 0) return;

  const gitignorePath = join(cwd, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
    // Missing .gitignore; create it below.
  }

  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missingEntries = entries.filter((entry) => !existingLines.has(entry));
  if (missingEntries.length === 0) return;

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const needsHeading = !existing.includes("# Kata CLI generated files");
  const block = [
    needsHeading ? "# Kata CLI generated files" : null,
    ...missingEntries,
  ].filter((line): line is string => Boolean(line)).join("\n");

  await writeFile(gitignorePath, `${existing}${prefix}${block}\n`, "utf8");
}

function gitignoreEntriesForTargets(targetKinds: SetupInstallTargetKind[]): string[] {
  const entries: string[] = [];
  if (targetKinds.includes("local-agents")) {
    entries.push(".agents/kata-setup-manifest.json");
  }
  if (targetKinds.includes("cursor")) {
    entries.push(".cursor/kata-setup-manifest.json");
  }
  if (targetKinds.includes("claude")) {
    entries.push(".claude/kata-setup-manifest.json");
  }
  return entries;
}

async function installSkillsToTarget(input: {
  target: ReturnType<typeof resolveInstallTarget>;
  source: { path: string; resolution: SkillsSourceResolution };
  packageVersion: string;
  harness: HarnessKind;
  now: string;
}): Promise<SetupInstallTargetResult> {
  await mkdir(input.target.targetDir, { recursive: true });
  const markerPath = join(input.target.targetDir, PI_SETUP_MARKER_FILENAME);
  const existing = await readExistingManifest(markerPath);
  const copiedSkillEntries = await copyDirectoryContents(input.source.path, input.target.skillsDir);
  await markManagedSkillEntries(input.target.skillsDir, copiedSkillEntries);
  await pruneRemovedManagedSkills(
    input.target.skillsDir,
    Array.isArray(existing?.managedSkillEntries) ? existing.managedSkillEntries : [],
    copiedSkillEntries,
  );

  const manifest: SetupManifest = {
    schemaVersion: 1,
    installedBy: "@kata-sh/cli",
    packageVersion: input.packageVersion,
    harnessDetected: input.harness,
    targetKind: input.target.kind,
    targetDir: input.target.targetDir,
    skillsDir: input.target.skillsDir,
    skillsSourceDir: input.source.path,
    firstInstalledAt: existing?.firstInstalledAt ?? input.now,
    installedAt: input.now,
    managedSkillEntries: copiedSkillEntries,
  };

  await writeFile(markerPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result: SetupInstallTargetResult = {
    kind: input.target.kind,
    targetDir: input.target.targetDir,
    skillsDir: input.target.skillsDir,
    skillsSourceDir: input.source.path,
    markerPath,
    markerWritten: true,
    skillsSourceResolution: input.source.resolution,
    installedEntries: copiedSkillEntries,
  };

  if (input.target.kind === "pi") {
    const { settingsPath } = await upsertPiSettings(input.target.targetDir);
    result.settingsPath = settingsPath;
    result.settingsWritten = true;
    result.agentDirResolution = input.target.agentDirResolution;
  }

  return result;
}

function setupErrorCode(error: unknown): SetupErrorResult["error"]["code"] {
  if (isRecord(error) && typeof error.code === "string") {
    const code = error.code;
    if (
      code === "SKILLS_SOURCE_MISSING" ||
      code === "SETUP_FAILED" ||
      code === "NON_INTERACTIVE_SETUP_REQUIRED" ||
      code === "GITHUB_AUTH_MISSING" ||
      code === "INVALID_INPUT"
    ) {
      return code;
    }
  }
  return "SETUP_FAILED";
}

export async function runSetup(input: RunSetupInput = {}): Promise<SetupResult> {
  const env = input.env ?? process.env;
  const harness = detectHarness(env);
  const cwd = input.cwd ?? process.cwd();
  const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
  const targetKinds = await resolveTargetKinds({ ...input, interactive });
  const mode: SetupSuccessResult["mode"] = targetKinds.length === 1 && targetKinds[0] === "pi" ? "pi-install" : "setup";

  const source = resolveSkillsSource(cwd);
  if (!source.exists) {
    return {
      ok: false,
      harness,
      mode: mode === "pi-install" ? "pi-install" : "setup",
      error: {
        code: "SKILLS_SOURCE_MISSING",
        message: source.resolution === "cli-workspace"
          ? `Missing CLI skills at ${source.path}. Run "pnpm --dir apps/cli run build" first.`
          : `Bundled skills directory not found at ${source.path}. Reinstall @kata-sh/cli.`,
      },
    };
  }

  try {
    const sourceStats = await stat(source.path);
    if (!sourceStats.isDirectory()) {
      return {
        ok: false,
        harness,
        mode: mode === "pi-install" ? "pi-install" : "setup",
        error: {
          code: "SKILLS_SOURCE_MISSING",
          message: `Kata skills path is not a directory: ${source.path}.`,
        },
      };
    }

    const preferences = await ensurePreferences({
      cwd,
      env,
      interactive,
      onboarding: input.onboarding,
    });
    await upsertGitignoreEntries(cwd, gitignoreEntriesForTargets(targetKinds));

    const now = (input.now ?? new Date()).toISOString();
    const packageVersion = input.packageVersion ?? "0.0.0-dev";
    const targets: SetupInstallTargetResult[] = [];

    for (const kind of targetKinds) {
      const target = resolveInstallTarget({ kind, cwd, env });
      targets.push(await installSkillsToTarget({
        target,
        source,
        packageVersion,
        harness,
        now,
      }));
    }

    const piTarget = targets.find((target) => target.kind === "pi");
    const installedLabels = targets.map((target) => target.skillsDir).join(", ");

    return {
      ok: true,
      harness,
      mode,
      message: `Kata setup completed. Preferences ${preferences.status === "created" ? "created" : "found"}; skills installed to ${installedLabels}.`,
      preferences,
      targets,
      ...(piTarget && piTarget.settingsPath && piTarget.agentDirResolution
        ? {
          pi: {
            agentDir: piTarget.targetDir,
            skillsDir: piTarget.skillsDir,
            skillsSourceDir: piTarget.skillsSourceDir,
            markerPath: piTarget.markerPath,
            markerWritten: true as const,
            settingsPath: piTarget.settingsPath,
            settingsWritten: true as const,
            agentDirResolution: piTarget.agentDirResolution,
            skillsSourceResolution: piTarget.skillsSourceResolution,
          },
        }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      harness,
      mode: mode === "pi-install" ? "pi-install" : "setup",
      error: {
        code: setupErrorCode(error),
        message: error instanceof Error ? error.message : "Unexpected setup failure",
      },
    };
  }
}
