import { describe, expect, it, vi } from "vitest";
import { resolveSymphonyConfig, isSymphonyConfigured } from "../config.js";
import { SymphonyError } from "../types.js";

describe("resolveSymphonyConfig", () => {
  it("resolves symphony.url from preferences", () => {
    const resolved = resolveSymphonyConfig({
      preferences: {
        symphony: {
          url: "http://localhost:8080",
        },
      },
      env: {},
    });

    expect(resolved).toEqual({
      url: "http://localhost:8080",
      origin: "preferences",
    });
  });

  it("uses SYMPHONY_URL when preferences are unset", () => {
    const resolved = resolveSymphonyConfig({
      preferences: {},
      env: {
        SYMPHONY_URL: "https://symphony.internal:8443/",
      },
    });

    expect(resolved).toEqual({
      url: "https://symphony.internal:8443",
      origin: "env",
    });
  });

  it("uses KATA_SYMPHONY_URL when preferences are unset", () => {
    const resolved = resolveSymphonyConfig({
      preferences: {},
      env: {
        KATA_SYMPHONY_URL: "https://kata-symphony.internal:9443/",
      },
    });

    expect(resolved).toEqual({
      url: "https://kata-symphony.internal:9443",
      origin: "env",
    });
  });

  it("prefers KATA_SYMPHONY_URL over SYMPHONY_URL", () => {
    const resolved = resolveSymphonyConfig({
      preferences: {},
      env: {
        KATA_SYMPHONY_URL: "https://kata-preferred.example.com",
        SYMPHONY_URL: "https://fallback.example.com",
      },
    });

    expect(resolved).toEqual({
      url: "https://kata-preferred.example.com",
      origin: "env",
    });
  });

  it("prefers symphony.url over SYMPHONY_URL", () => {
    const resolved = resolveSymphonyConfig({
      preferences: {
        symphony: {
          url: "https://preferred.example.com",
        },
      },
      env: {
        SYMPHONY_URL: "https://fallback.example.com",
      },
    });

    expect(resolved).toEqual({
      url: "https://preferred.example.com",
      origin: "preferences",
    });
  });

  it("throws config_missing when no URL is configured", () => {
    expect(() =>
      resolveSymphonyConfig({
        preferences: {},
        env: {},
      }),
    ).toThrowError(SymphonyError);

    try {
      resolveSymphonyConfig({ preferences: {}, env: {} });
      throw new Error("expected resolveSymphonyConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SymphonyError);
      const symphonyError = error as SymphonyError;
      expect(symphonyError.code).toBe("config_missing");
      expect(symphonyError.context.reason).toContain("missing");
    }
  });

  it("throws config_invalid for malformed URLs", () => {
    try {
      resolveSymphonyConfig({
        preferences: {
          symphony: {
            url: "not-a-url",
          },
        },
        env: {},
      });
      throw new Error("expected resolveSymphonyConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SymphonyError);
      const symphonyError = error as SymphonyError;
      expect(symphonyError.code).toBe("config_invalid");
      expect(symphonyError.context.origin).toBe("preferences");
    }
  });

  it("throws config_invalid for unsupported protocols", () => {
    try {
      resolveSymphonyConfig({
        preferences: {},
        env: {
          SYMPHONY_URL: "ftp://localhost:8080",
        },
      });
      throw new Error("expected resolveSymphonyConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SymphonyError);
      const symphonyError = error as SymphonyError;
      expect(symphonyError.code).toBe("config_invalid");
      expect(symphonyError.context.reason).toBe("unsupported_protocol");
    }
  });
});

describe("isSymphonyConfigured", () => {
  it("returns false when no Symphony URL is configured anywhere", () => {
    // Use explicit env override and a non-existent cwd so no preferences are found
    expect(
      isSymphonyConfigured({ env: {}, cwd: "/tmp/__nonexistent_path__" }),
    ).toBe(false);
  });

  it("returns true when KATA_SYMPHONY_URL env var is set", () => {
    expect(
      isSymphonyConfigured({
        env: { KATA_SYMPHONY_URL: "http://localhost:8080" },
        cwd: "/tmp/__nonexistent_path__",
      }),
    ).toBe(true);
  });

  it("returns true when SYMPHONY_URL env var is set", () => {
    expect(
      isSymphonyConfigured({
        env: { SYMPHONY_URL: "http://localhost:8080" },
        cwd: "/tmp/__nonexistent_path__",
      }),
    ).toBe(true);
  });
});
