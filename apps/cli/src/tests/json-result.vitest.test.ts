import { describe, expect, it } from "vitest";

import { jsonResultIndicatesFailure } from "../commands/json-result.js";

describe("jsonResultIndicatesFailure", () => {
  it("detects ok:false results so CLI commands can fail shell chains", () => {
    expect(jsonResultIndicatesFailure(JSON.stringify({ ok: false, error: { code: "INVALID_CONFIG" } }))).toBe(true);
  });

  it("does not mark ok:true or non-json output as failed JSON results", () => {
    expect(jsonResultIndicatesFailure(JSON.stringify({ ok: true, data: {} }))).toBe(false);
    expect(jsonResultIndicatesFailure("Usage: kata call <operation>")).toBe(false);
  });
});
