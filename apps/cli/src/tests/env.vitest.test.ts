import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDotEnv } from "../env.js";

describe("loadDotEnv", () => {
  it("loads repo-local env vars without overwriting exported values", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-env-"));

    try {
      mkdirSync(join(tmp, "repo"), { recursive: true });
      writeFileSync(
        join(tmp, "repo", ".env"),
        [
          "# ignored",
          "GH_TOKEN=ghp_from_file",
          "GITHUB_TOKEN=from-file",
          "QUOTED=\"hello world\"",
          "QUOTED_WITH_COMMENT=\"hello # world\" # comment",
          "SINGLE_QUOTED_WITH_COMMENT='hello # world' # comment",
          "INLINE=value # comment",
          "INVALID-KEY=ignored",
        ].join("\n"),
        "utf8",
      );

      const env: NodeJS.ProcessEnv = {
        GITHUB_TOKEN: "from-shell",
      };

      loadDotEnv({ cwd: join(tmp, "repo"), env });

      expect(env.GH_TOKEN).toBe("ghp_from_file");
      expect(env.GITHUB_TOKEN).toBe("from-shell");
      expect(env.QUOTED).toBe("hello world");
      expect(env.QUOTED_WITH_COMMENT).toBe("hello # world");
      expect(env.SINGLE_QUOTED_WITH_COMMENT).toBe("hello # world");
      expect(env.INLINE).toBe("value");
      expect(env["INVALID-KEY"]).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
