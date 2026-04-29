import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadDotEnv(input: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  filename?: string;
}): NodeJS.ProcessEnv {
  const env = input.env ?? process.env;
  const path = join(input.cwd, input.filename ?? ".env");
  if (!existsSync(path)) return env;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (env[key] !== undefined) continue;

    env[key] = parseDotEnvValue(line.slice(separatorIndex + 1).trim());
  }

  return env;
}

function parseDotEnvValue(rawValue: string): string {
  if (rawValue.length >= 2) {
    const quote = rawValue[0];
    if ((quote === `"` || quote === `'`) && rawValue[rawValue.length - 1] === quote) {
      const inner = rawValue.slice(1, -1);
      return quote === `"` ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t") : inner;
    }
  }

  const commentIndex = rawValue.search(/\s#/);
  return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}

