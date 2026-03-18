import { copyFileSync, cpSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { DEFAULT_CONFIG } from "../src/types.js";
import { indexProject } from "../src/indexer.js";
import { GraphStore } from "../src/graph/store.js";
import { createTempGitRepo } from "./helpers/git-fixtures.js";

const SEMANTIC_FIXTURE_ROOT = resolve(
  import.meta.dirname!,
  "fixtures/semantic/repo-a",
);

function seedRepoFromFixture(): string {
  const repoDir = createTempGitRepo("kata-semantic-int-");

  cpSync(
    join(SEMANTIC_FIXTURE_ROOT, "src"),
    join(repoDir, "src"),
    { recursive: true },
  );
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

describe("integration semantic indexing contract (T01 red-first)", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = seedRepoFromFixture();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("missing provider keys: reports semantic failure codes while preserving structural index integrity", () => {
    const store = new GraphStore(":memory:");
    try {
      const config = {
        ...DEFAULT_CONFIG,
        summaryThreshold: 3,
        providers: {
          ...DEFAULT_CONFIG.providers,
          openai: {
            ...DEFAULT_CONFIG.providers.openai,
            model: "text-embedding-3-small",
            batchSize: 2,
          },
        },
      };

      const result = indexProject(repoDir, { store, config }) as any;

      // Structural indexing should still work even when semantic stage fails.
      expect(store.getStats().symbols).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      // Semantic diagnostics must be explicit + machine-parseable.
      expect(result.semantic).toMatchObject({
        status: "failed",
        phase: "embedding",
        errorCode: "SEMANTIC_OPENAI_MISSING_KEY",
        retryable: false,
      });
      expect(typeof result.semantic.timestamp).toBe("string");
    } finally {
      store.close();
    }
  });

  it("keeps semantic vectors in parity with symbol lifecycle across rename/delete", () => {
    const store = new GraphStore(":memory:");
    try {
      const config = {
        ...DEFAULT_CONFIG,
        summaryThreshold: 3,
        providers: {
          ...DEFAULT_CONFIG.providers,
          openai: {
            ...DEFAULT_CONFIG.providers.openai,
            batchSize: 2,
          },
        },
      };

      indexProject(repoDir, { store, config });

      // Rename auth file and delete router file in one incremental commit.
      execSync("mkdir -p src/security", { cwd: repoDir, stdio: "pipe" });
      execSync("git mv src/auth.ts src/security/auth.ts", {
        cwd: repoDir,
        stdio: "pipe",
      });
      execSync("git rm src/router.ts", { cwd: repoDir, stdio: "pipe" });
      execSync("git commit -m 'rename auth and delete router'", {
        cwd: repoDir,
        stdio: "pipe",
      });

      const result = indexProject(repoDir, { store, config }) as any;
      expect(result.incremental).toBe(true);

      const storeAny = store as any;
      expect(typeof storeAny.countSemanticVectors).toBe("function");
      expect(typeof storeAny.querySemanticVectorsByFile).toBe("function");

      const vectorCount = storeAny.countSemanticVectors();
      expect(vectorCount).toBe(store.getStats().symbols);

      const oldPathVectors = storeAny.querySemanticVectorsByFile("src/auth.ts");
      const deletedPathVectors = storeAny.querySemanticVectorsByFile("src/router.ts");
      expect(oldPathVectors).toHaveLength(0);
      expect(deletedPathVectors).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("emits semantic stage events with phase/provider/errorCode/timing fields", () => {
    const store = new GraphStore(":memory:");
    try {
      const result = indexProject(repoDir, {
        store,
        config: {
          ...DEFAULT_CONFIG,
          summaryThreshold: 3,
        },
      }) as any;

      expect(Array.isArray(result.semantic?.events)).toBe(true);
      expect(result.semantic.events.length).toBeGreaterThan(0);

      for (const event of result.semantic.events) {
        expect(event).toMatchObject({
          phase: expect.any(String),
          provider: expect.any(String),
          symbolCount: expect.any(Number),
          durationMs: expect.any(Number),
        });
        // errorCode is optional on successful events but must be present on failed events.
        if (event.status === "failed") {
          expect(typeof event.errorCode).toBe("string");
        }
      }
    } finally {
      store.close();
    }
  });
});
