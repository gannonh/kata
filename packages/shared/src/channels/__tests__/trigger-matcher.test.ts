import { describe, test, expect } from "vitest";
import { TriggerMatcher } from "../trigger-matcher.ts";

describe("TriggerMatcher", () => {
  test("no patterns matches all messages", () => {
    const matcher = new TriggerMatcher([]);
    expect(matcher.matches("anything")).toBe(true);
    expect(matcher.matches("")).toBe(true);
    expect(matcher.matches("hello world")).toBe(true);
  });

  test("single pattern matches when present", () => {
    const matcher = new TriggerMatcher(["@kata-sh"]);
    expect(matcher.matches("hey @kata-sh help")).toBe(true);
  });

  test("single pattern rejects when absent", () => {
    const matcher = new TriggerMatcher(["@kata-sh"]);
    expect(matcher.matches("hello world")).toBe(false);
  });

  test("multiple patterns match if any pattern matches", () => {
    const matcher = new TriggerMatcher(["@kata-sh", "!help"]);
    expect(matcher.matches("!help me")).toBe(true);
    expect(matcher.matches("hey @kata-sh")).toBe(true);
    expect(matcher.matches("nothing here")).toBe(false);
  });

  test("patterns are case-insensitive", () => {
    const matcher = new TriggerMatcher(["@KATA-SH"]);
    expect(matcher.matches("hey @kata-sh")).toBe(true);
    expect(matcher.matches("hey @Kata-Sh")).toBe(true);
    expect(matcher.matches("hey @KATA-SH")).toBe(true);
  });

  test("regex anchors work", () => {
    const matcher = new TriggerMatcher(["^important"]);
    expect(matcher.matches("important update")).toBe(true);
    expect(matcher.matches("not important")).toBe(false);
  });

  test("invalid regex pattern throws descriptive error", () => {
    expect(() => new TriggerMatcher(["[invalid"])).toThrow("[invalid");
  });
});
