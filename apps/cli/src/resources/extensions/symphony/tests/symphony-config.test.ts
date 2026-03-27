import { describe, expect, it } from "vitest";
import { resolveSymphonyConfig } from "../config.js";
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
