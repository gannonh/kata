import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { SymphonyExtensionError } from "./errors.ts";
import type { ExtensionState } from "./state.ts";

export interface ResolveBinaryOptions {
  cwd: string;
  state: ExtensionState;
  env?: NodeJS.ProcessEnv;
  promptForPath?: () => Promise<string | undefined>;
}

export async function resolveSymphonyBinary(options: ResolveBinaryOptions): Promise<string> {
  const env = options.env ?? process.env;
  const candidates: string[] = [];

  if (env.SYMPHONY_BIN) candidates.push(env.SYMPHONY_BIN);

  const repoLocal = await findRepoLocalBinary(options.cwd);
  if (repoLocal) candidates.push(repoLocal);

  const pathBinary = await findOnPath("symphony", env);
  if (pathBinary) candidates.push(pathBinary);

  if (options.state.binaryPath) candidates.push(options.state.binaryPath);

  for (const candidate of candidates) {
    try {
      return await validateBinaryPath(candidate);
    } catch {
      continue;
    }
  }

  const prompted = await options.promptForPath?.();
  if (prompted) {
    const validated = await validateBinaryPath(prompted);
    options.state.binaryPath = validated;
    return validated;
  }

  throw new SymphonyExtensionError(
    "missing_binary",
    "Could not find Symphony binary. Set SYMPHONY_BIN, build apps/symphony/target/release/symphony, add symphony to PATH, or provide an absolute path.",
  );
}

export async function validateBinaryPath(path: string): Promise<string> {
  if (!isAbsolute(path)) {
    throw new SymphonyExtensionError("invalid_binary", "Symphony binary path must be absolute", { path });
  }
  let isFile: boolean;
  try {
    isFile = (await stat(path)).isFile();
  } catch (error) {
    throw new SymphonyExtensionError("invalid_binary", "Symphony binary path is not executable", {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isFile) {
    throw new SymphonyExtensionError("invalid_binary", "Symphony binary path is not a file", { path });
  }
  try {
    await access(path, constants.X_OK);
  } catch (error) {
    throw new SymphonyExtensionError("invalid_binary", "Symphony binary path is not executable", {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return path;
}

async function findRepoLocalBinary(cwd: string): Promise<string | undefined> {
  let current = cwd;
  while (true) {
    const candidate = join(current, "apps", "symphony", "target", "release", process.platform === "win32" ? "symphony.exe" : "symphony");
    try {
      await validateBinaryPath(candidate);
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

async function findOnPath(command: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const commandNames = pathCommandNames(command, env);
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const commandName of commandNames) {
      const candidate = join(dir, commandName);
      try {
        await validateBinaryPath(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

function pathCommandNames(command: string, env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return [command];

  const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean)
    .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`));
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}
