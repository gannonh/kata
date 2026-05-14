import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const packagePath = resolve(here, "../package.json");

describe("pi package manifest", () => {
  it("declares the Pi extension entrypoint and package identity", async () => {
    const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
      name?: string;
      keywords?: string[];
      pi?: { extensions?: string[] };
      peerDependencies?: Record<string, string>;
    };

    expect(manifest.name).toBe("@kata-sh/pi-symphony-extension");
    expect(manifest.keywords).toContain("pi-package");
    expect(manifest.pi?.extensions).toEqual(["./src/index.ts"]);
    expect(manifest.peerDependencies?.["@earendil-works/pi-coding-agent"]).toBe("*");
    expect(manifest.peerDependencies?.["@earendil-works/pi-tui"]).toBe("*");
  });
});
