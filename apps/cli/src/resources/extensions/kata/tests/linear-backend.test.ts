import { describe, it, expect } from "vitest";
import { LinearBackend, type LinearBackendConfig } from "../linear-backend.js";
import type { KataBackend } from "../backend.js";

const TEST_CONFIG: LinearBackendConfig = {
  apiKey: "test-key",
  projectId: "proj-123",
  teamId: "team-456",
  sliceLabelId: "label-789",
};

describe("LinearBackend", () => {
  it("satisfies the KataBackend interface", () => {
    const backend: KataBackend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    expect(backend).toBeDefined();
  });

  it("sets basePath from constructor", () => {
    const backend = new LinearBackend("/tmp/test-project", TEST_CONFIG);
    expect(backend.basePath).toBe("/tmp/test-project");
  });
});
