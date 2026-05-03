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
  const value = rawValue.trim();
  if (value.length >= 2) {
    const quote = value[0];
    if (quote === `"` || quote === `'`) {
      for (let index = 1; index < value.length; index += 1) {
        const char = value[index];
        const escaped = quote === `"` && value[index - 1] === "\\";
        if (char === quote && !escaped) {
          const trailing = value.slice(index + 1).trim();
          if (!trailing || trailing.startsWith("#")) {
            const inner = value.slice(1, index);
            return quote === `"` ? decodeDoubleQuotedDotEnvValue(inner) : inner;
          }
          break;
        }
      }
    }
  }

  const commentIndex = value.search(/\s#/);
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
}

function decodeDoubleQuotedDotEnvValue(value: string): string {
  const escapes = new Map<string, string>([
    ["n", "\n"],
    ["r", "\r"],
    ["t", "\t"],
    [`"`, `"`],
    ["\\", "\\"],
  ]);
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\" || index === value.length - 1) {
      decoded += char;
      continue;
    }
    const next = value[index + 1]!;
    decoded += escapes.get(next) ?? `\\${next}`;
    index += 1;
  }
  return decoded;
}
