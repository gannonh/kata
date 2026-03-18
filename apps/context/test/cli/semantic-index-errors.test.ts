import { copyFileSync, cpSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { indexProject } from "../../src/indexer.js";
import { GraphStore } from "../../src/graph/store.js";
import { DEFAULT_CONFIG } from "../../src/types.js";
import * as formatters from "../../src/formatters.js";
import * as cliModule from "../../src/cli.js";
import { createTempGitRepo } from "../helpers/git-fixtures.js";

const SEMANTIC_FIXTURE_ROOT = resolve(
  import.meta.dirname!,
  "../fixtures/semantic/repo-a",
);

function seedRepoFromFixture(): string {
  const repoDir = createTempGitRepo("kata-semantic-cli-");

  cpSync(join(SEMANTIC_FIXTURE_ROOT, "src"), join(repoDir, "src"), {
    recursive: true,
  });
  copyFileSync(
    join(SEMANTIC_FIXTURE_ROOT, "README.md"),
    join(repoDir, "README.md"),
  );

  execSync("git add .", { cwd: repoDir, stdio: "pipe" });
  execSync("git commit -m 'seed semantic fixture'", {
    cwd: repoDir,
    stdio: "pipe",
  });

  return repoDir;
}

describe("CLI semantic diagnostics contract (T01 red-first)", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = seedRepoFromFixture();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("exports dedicated semantic diagnostic formatters for CLI output modes", () => {
    expect(typeof (formatters as any).formatSemanticDiagnostics).toBe("function");
    expect(typeof (formatters as any).formatSemanticDiagnosticHint).toBe("function");
  });

  it("index JSON payload includes semantic status, code, phase, and hint", () => {
    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(repoDir, {
        store,
        config: {
          ...DEFAULT_CONFIG,
          summaryThreshold: 3,
        },
      }) as any;

      const jsonData = {
        filesIndexed: result.filesIndexed,
        symbolsExtracted: result.symbolsExtracted,
        edgesCreated: result.edgesCreated,
        duration: result.duration,
        errors: result.errors,
        incremental: result.incremental,
        semantic: result.semantic,
      };

      expect(jsonData.semantic).toMatchObject({
        status: "failed",
        phase: "embedding",
        errorCode: "SEMANTIC_OPENAI_MISSING_KEY",
        hint: expect.stringContaining("OPENAI_API_KEY"),
      });
    } finally {
      store.close();
    }
  });

  it("index human output includes a Semantic Diagnostics section with stable code", () => {
    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(repoDir, {
        store,
        config: {
          ...DEFAULT_CONFIG,
          summaryThreshold: 3,
        },
      }) as any;

      const formatSemanticDiagnostics = (formatters as any).formatSemanticDiagnostics;
      expect(typeof formatSemanticDiagnostics).toBe("function");

      const section = formatSemanticDiagnostics(result.semantic);
      expect(section).toContain("Semantic Diagnostics");
      expect(section).toContain("SEMANTIC_OPENAI_MISSING_KEY");
      expect(section).toContain("embedding");
      expect(section).toContain("OPENAI_API_KEY");
    } finally {
      store.close();
    }
  });

  it("CLI module exports a semantic-code-to-remediation mapper", () => {
    const mapper = (cliModule as any).semanticRemediationForCode;
    expect(typeof mapper).toBe("function");

    expect(mapper("SEMANTIC_OPENAI_MISSING_KEY")).toContain("OPENAI_API_KEY");
    expect(mapper("SEMANTIC_OPENAI_AUTH")).toContain("API key");
    expect(mapper("SEMANTIC_OPENAI_RATE_LIMIT")).toContain("rate limit");
    expect(mapper("SEMANTIC_OPENAI_PROVIDER_UNAVAILABLE")).toContain(
      "provider",
    );
  });
});
