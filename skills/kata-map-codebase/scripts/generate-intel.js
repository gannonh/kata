#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DOC_FILES = [
  "STACK.md",
  "ARCHITECTURE.md",
  "CONVENTIONS.md",
  "TESTING.md",
  "STRUCTURE.md",
  "INTEGRATIONS.md",
  "CONCERNS.md",
];

const SOURCE_LABEL = "kata-map-codebase";

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveProjectRoot() {
  const envRoot = process.env.KATA_PROJECT_ROOT;
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    if (dirExists(path.join(resolved, ".planning"))) {
      return resolved;
    }
  }

  const cwd = process.cwd();
  const candidates = [cwd, path.join(cwd, "main")];
  for (const candidate of candidates) {
    if (dirExists(path.join(candidate, ".planning"))) {
      return path.resolve(candidate);
    }
  }

  throw new Error(
    "Could not find project root. Expected .planning/ in CWD or CWD/main, or set KATA_PROJECT_ROOT.",
  );
}

function getCurrentCommitHash(projectRoot) {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function readDocs(codebaseDir) {
  const docs = {};
  for (const name of DOC_FILES) {
    const fullPath = path.join(codebaseDir, name);
    docs[name] = fileExists(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
  }
  return docs;
}

function unique(items) {
  return Array.from(new Set(items));
}

function pickFirstStyle(text, patterns) {
  for (const entry of patterns) {
    if (entry.regex.test(text)) {
      return entry.value;
    }
  }
  return "unknown";
}

function classifyType(filePath) {
  const p = filePath.toLowerCase();
  if (
    p.includes(".test.") ||
    p.includes(".spec.") ||
    p.includes("/test/") ||
    p.includes("/tests/")
  ) {
    return "test";
  }
  if (p.includes("/component") || p.includes("component")) {
    return "component";
  }
  if (p.includes("/service") || p.includes("service")) {
    return "service";
  }
  if (
    p.includes("/route") ||
    p.includes("/routes/") ||
    p.includes("/controller") ||
    p.includes("/api/")
  ) {
    return "route";
  }
  if (
    p.includes("/model") ||
    p.includes("/models/") ||
    p.includes("/schema") ||
    p.includes("/entity")
  ) {
    return "model";
  }
  if (p.includes("config") || p.endsWith(".config.js") || p.endsWith(".config.ts")) {
    return "config";
  }
  return "util";
}

function classifyLayer(filePath) {
  const p = filePath.toLowerCase();
  if (
    p.includes("/component") ||
    p.includes("/ui/") ||
    p.includes("/view/") ||
    p.includes("/pages/")
  ) {
    return "ui";
  }
  if (
    p.includes("/api/") ||
    p.includes("/route") ||
    p.includes("/controller") ||
    p.includes("/server/")
  ) {
    return "api";
  }
  if (
    p.includes("/db/") ||
    p.includes("/data/") ||
    p.includes("/model") ||
    p.includes("/schema") ||
    p.includes("/repository")
  ) {
    return "data";
  }
  return "shared";
}

function extractPathCandidates(text) {
  const paths = [];
  // Simple non-backtracking match: collect all backtick-quoted strings then
  // filter for path-like content. The previous regex
  // /`([^`]+(?:\/[^`]+)*\.[a-zA-Z0-9]+)`/g caused catastrophic backtracking:
  // the two [^`]+ quantifiers competed over / characters, giving O(2^n) attempts
  // on strings containing slashes but no file extension.
  const backtickRegex = /`([^`\n]+)`/g;
  const barePathRegex =
    /\b(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+\b/g;

  for (const match of text.matchAll(backtickRegex)) {
    const content = match[1];
    if (content.includes("/") && /\.[a-zA-Z0-9]+/.test(content)) {
      paths.push(content);
    }
  }
  for (const match of text.matchAll(barePathRegex)) {
    paths.push(match[0]);
  }

  const filtered = paths
    .map((p) => p.trim().replace(/^\.?\//, ""))
    .filter((p) => !p.startsWith("http"))
    .filter((p) => p.includes("/"))
    .filter((p) => !p.startsWith(".planning/"))
    .filter((p) => !p.startsWith("node_modules/"));

  return unique(filtered).sort();
}

function extractImportsExports(pathValue, docsText) {
  const lines = docsText.split(/\r?\n/);
  const related = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(pathValue)) {
      related.push(lines[i]);
      if (i + 1 < lines.length) {
        related.push(lines[i + 1]);
      }
      if (i + 2 < lines.length) {
        related.push(lines[i + 2]);
      }
    }
  }

  const imports = [];
  const exports = [];
  const importRegex = /import[s]?:\s*([^|]+)/i;
  const exportRegex = /export[s]?:\s*([^|]+)/i;

  for (const line of related) {
    const importMatch = line.match(importRegex);
    const exportMatch = line.match(exportRegex);
    if (importMatch) {
      imports.push(
        ...importMatch[1]
          .split(/[,\s]+/)
          .map((s) => s.replace(/[`"'()]/g, "").trim())
          .filter(Boolean),
      );
    }
    if (exportMatch) {
      exports.push(
        ...exportMatch[1]
          .split(/[,\s]+/)
          .map((s) => s.replace(/[`"'()]/g, "").trim())
          .filter(Boolean),
      );
    }
  }

  return {
    imports: unique(imports).sort(),
    exports: unique(exports).sort(),
  };
}

function buildIndex(docs, generatedIso, projectRoot) {
  const structureText = docs["STRUCTURE.md"] || "";
  const architectureText = docs["ARCHITECTURE.md"] || "";
  const sourceText = `${structureText}\n${architectureText}`;
  const candidates = extractPathCandidates(sourceText);
  const files = {};
  const byType = {};
  const byLayer = {};

  for (const filePath of candidates) {
    const type = classifyType(filePath);
    const layer = classifyLayer(filePath);
    const io = extractImportsExports(filePath, sourceText);
    files[filePath] = {
      exports: io.exports,
      imports: io.imports,
      type,
      layer,
    };
    byType[type] = (byType[type] || 0) + 1;
    byLayer[layer] = (byLayer[layer] || 0) + 1;
  }

  return {
    version: 2,
    generated: generatedIso,
    source: SOURCE_LABEL,
    commitHash: getCurrentCommitHash(projectRoot),
    files,
    stats: {
      totalFiles: Object.keys(files).length,
      byType,
      byLayer,
    },
  };
}

function extractDirectoryPurposes(structureText) {
  const directories = {};
  const blockRegex = /\*\*`([^`]+)`:\*\*\s*\n- Purpose:\s*([^\n]+)/g;
  for (const match of structureText.matchAll(blockRegex)) {
    const key = match[1].replace(/\/+$/, "").split("/").pop();
    if (key) {
      directories[key] = match[1];
    }
  }
  return directories;
}

function collectPatternLines(text, keywords, limit) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)))
    .slice(0, limit);
  return lines;
}

function buildConventions(docs, generatedIso, projectRoot) {
  const conventionsText = docs["CONVENTIONS.md"] || "";
  const testingText = docs["TESTING.md"] || "";
  const structureText = docs["STRUCTURE.md"] || "";
  const combined = `${conventionsText}\n${testingText}`;

  const naming = {
    files: pickFirstStyle(conventionsText, [
      { regex: /kebab-case/i, value: "kebab-case" },
      { regex: /snake_case/i, value: "snake_case" },
      { regex: /camelcase/i, value: "camelCase" },
      { regex: /pascalcase/i, value: "PascalCase" },
    ]),
    functions: pickFirstStyle(combined, [
      { regex: /camelcase/i, value: "camelCase" },
      { regex: /snake_case/i, value: "snake_case" },
      { regex: /pascalcase/i, value: "PascalCase" },
    ]),
    variables: pickFirstStyle(combined, [
      { regex: /caps_underscores|screaming_snake/i, value: "SCREAMING_SNAKE" },
      { regex: /camelcase/i, value: "camelCase" },
      { regex: /snake_case/i, value: "snake_case" },
    ]),
  };

  const directories = extractDirectoryPurposes(structureText);

  const patterns = {
    imports:
      collectPatternLines(conventionsText, ["import"], 3).join(" | ") || "No explicit import pattern detected",
    error_handling:
      collectPatternLines(conventionsText, ["error", "exception"], 3).join(" | ") ||
      "No explicit error handling pattern detected",
    testing:
      collectPatternLines(testingText, ["test", "verify", "tdd"], 5).join(" | ") ||
      "No explicit testing pattern detected",
  };

  let confidence = "low";
  if (conventionsText && testingText) {
    confidence = "high";
  } else if (conventionsText || testingText) {
    confidence = "medium";
  }

  return {
    version: 1,
    generated: generatedIso,
    commitHash: getCurrentCommitHash(projectRoot),
    naming,
    directories,
    patterns,
    confidence,
  };
}

function nonEmptyTrimmedLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function chooseLines(text, lineFilter, limit) {
  return nonEmptyTrimmedLines(text).filter(lineFilter).slice(0, limit);
}

function toBullet(lines) {
  return lines.map((line) => `- ${line.replace(/^-+\s*/, "")}`);
}

function buildSectionLines(docs) {
  const stackText = docs["STACK.md"] || "";
  const architectureText = docs["ARCHITECTURE.md"] || "";
  const conventionsText = docs["CONVENTIONS.md"] || "";
  const testingText = docs["TESTING.md"] || "";
  const integrationsText = docs["INTEGRATIONS.md"] || "";
  const concernsText = docs["CONCERNS.md"] || "";
  const structureText = docs["STRUCTURE.md"] || "";

  const stack = toBullet(
    chooseLines(
      stackText,
      (line) =>
        line.startsWith("- ") ||
        line.startsWith("**Primary") ||
        line.startsWith("**Environment") ||
        line.startsWith("**Frameworks"),
      14,
    ),
  );

  const architecture = toBullet(
    chooseLines(
      architectureText,
      (line) =>
        line.startsWith("- ") ||
        /^\d+\./.test(line) ||
        line.startsWith("**Overall") ||
        line.includes("Layer"),
      22,
    ),
  );

  const conventions = toBullet(
    unique([
      ...chooseLines(
        conventionsText,
        (line) =>
          line.startsWith("- ") ||
          line.startsWith("**Files") ||
          line.startsWith("**Variables") ||
          line.startsWith("**Commands") ||
          line.startsWith("Pattern:"),
        18,
      ),
      ...chooseLines(
        testingText,
        (line) => line.startsWith("- ") || line.includes("TDD") || line.includes("verify"),
        8,
      ),
    ]).slice(0, 24),
  );

  const keyPatterns = toBullet(
    unique([
      ...chooseLines(
        architectureText,
        (line) => /^\d+\./.test(line) || line.includes("Flow") || line.includes("State"),
        10,
      ),
      ...chooseLines(
        integrationsText,
        (line) => line.startsWith("- ") || line.includes("Integration") || line.includes("Hook"),
        10,
      ),
      ...chooseLines(
        structureText,
        (line) => line.startsWith("- ") || line.includes("Entry Points"),
        6,
      ),
    ]).slice(0, 24),
  );

  const concerns = toBullet(
    chooseLines(
      concernsText,
      (line) =>
        line.startsWith("- ") ||
        line.startsWith("**") ||
        line.startsWith("Issue:") ||
        line.startsWith("Impact:") ||
        line.startsWith("Fix approach:"),
      24,
    ),
  );

  return { stack, architecture, conventions, keyPatterns, concerns };
}

function loadTemplate(skillDir) {
  const templatePath = path.join(skillDir, "references", "summary-template.md");
  if (!fileExists(templatePath)) {
    return null;
  }
  return fs.readFileSync(templatePath, "utf8");
}

function ensureLineBounds(lines, min, max) {
  const trimmed = lines.slice(0, max);
  if (trimmed.length >= min) {
    return trimmed;
  }
  const padded = [...trimmed];
  while (padded.length < min) {
    padded.push("- Additional codebase detail not available in source docs.");
  }
  return padded.slice(0, max);
}

function buildSummary(docs, generatedDate, skillDir) {
  const sections = buildSectionLines(docs);
  const template = loadTemplate(skillDir);

  const lines = [];
  lines.push("# Codebase Intelligence Summary");
  lines.push("");
  lines.push(`Generated: ${generatedDate} | Source: .planning/codebase/`);
  lines.push("");

  lines.push("## Stack");
  lines.push(...(sections.stack.length > 0 ? sections.stack : ["- Stack details not available."]));
  lines.push("");

  lines.push("## Architecture");
  lines.push(
    ...(sections.architecture.length > 0
      ? sections.architecture
      : ["- Architecture details not available."]),
  );
  lines.push("");

  lines.push("## Conventions");
  lines.push(
    ...(sections.conventions.length > 0
      ? sections.conventions
      : ["- Conventions not available."]),
  );
  lines.push("");

  lines.push("## Key Patterns");
  lines.push(
    ...(sections.keyPatterns.length > 0
      ? sections.keyPatterns
      : ["- Key patterns not available."]),
  );
  lines.push("");

  lines.push("## Concerns");
  lines.push(
    ...(sections.concerns.length > 0 ? sections.concerns : ["- No explicit concerns documented."]),
  );

  if (template) {
    lines.push("");
    lines.push("## Template Reference");
    lines.push("- Generated using skills/kata-map-codebase/references/summary-template.md schema.");
  }

  const bounded = ensureLineBounds(lines, 30, 150);
  return `${bounded.join("\n")}\n`;
}

function main() {
  const projectRoot = resolveProjectRoot();
  const codebaseDir = path.join(projectRoot, ".planning", "codebase");
  const intelDir = path.join(projectRoot, ".planning", "intel");
  const generatedIso = new Date().toISOString();
  const generatedDate = generatedIso.slice(0, 10);
  const scriptFile = fileURLToPath(import.meta.url);
  const skillDir = path.dirname(path.dirname(scriptFile));

  if (!dirExists(codebaseDir)) {
    throw new Error(`Missing codebase docs directory: ${codebaseDir}`);
  }

  const docs = readDocs(codebaseDir);
  fs.mkdirSync(intelDir, { recursive: true });

  const indexJson = buildIndex(docs, generatedIso, projectRoot);
  const conventionsJson = buildConventions(docs, generatedIso, projectRoot);
  const summaryMd = buildSummary(docs, generatedDate, skillDir);

  fs.writeFileSync(path.join(intelDir, "index.json"), `${JSON.stringify(indexJson, null, 2)}\n`);
  fs.writeFileSync(
    path.join(intelDir, "conventions.json"),
    `${JSON.stringify(conventionsJson, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(intelDir, "summary.md"), summaryMd);

  const summaryLines = summaryMd.split(/\r?\n/).filter(Boolean).length;
  const fileCount = Object.keys(indexJson.files).length;
  console.log(`Generated intel artifacts in ${intelDir}`);
  console.log(`files indexed: ${fileCount}`);
  console.log(`summary lines: ${summaryLines}`);
}

try {
  main();
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`generate-intel.js failed: ${message}`);
  process.exit(1);
}
