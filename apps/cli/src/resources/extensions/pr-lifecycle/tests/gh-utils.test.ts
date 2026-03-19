import assert from "node:assert/strict";

import { parseBranchToSlice } from "../gh-utils.js";

describe("parseBranchToSlice", () => {
  test("parses legacy kata/<M>/<S> branch format", () => {
    assert.deepEqual(parseBranchToSlice("kata/M005/S02"), {
      milestoneId: "M005",
      sliceId: "S02",
    });
  });

  test("parses namespaced kata/<scope>/<M>/<S> branch format", () => {
    assert.deepEqual(parseBranchToSlice("kata/apps-cli/M005/S02"), {
      milestoneId: "M005",
      sliceId: "S02",
    });
  });

  test("returns null for non-kata branches", () => {
    assert.equal(parseBranchToSlice("main"), null);
    assert.equal(parseBranchToSlice("feature/M005/S02"), null);
  });

  test("returns null for malformed kata branch values", () => {
    assert.equal(parseBranchToSlice("kata/M005"), null);
    assert.equal(parseBranchToSlice("kata/apps-cli/M005"), null);
    assert.equal(parseBranchToSlice("kata/apps-cli/m005/S02"), null);
    assert.equal(parseBranchToSlice("kata/apps-cli/M005/s02"), null);
  });
});
