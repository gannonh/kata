/**
 * Contract tests for Linear cross-linking helpers (S06).
 *
 * Tests pin the shouldCrossLink gate, reference section formatting,
 * and composePRBody integration with Linear references.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldCrossLink,
  buildLinearReferencesSection,
} from "../linear-crosslink.js";

// ─── shouldCrossLink gate ─────────────────────────────────────────────────────

test("shouldCrossLink returns true when linear_link is true and mode is linear", () => {
  assert.equal(shouldCrossLink({ linear_link: true }, "linear"), true);
});

test("shouldCrossLink returns false when linear_link is true but mode is file", () => {
  assert.equal(shouldCrossLink({ linear_link: true }, "file"), false);
});

test("shouldCrossLink returns false when linear_link is false and mode is linear", () => {
  assert.equal(shouldCrossLink({ linear_link: false }, "linear"), false);
});

test("shouldCrossLink returns false when linear_link is undefined", () => {
  assert.equal(shouldCrossLink({}, "linear"), false);
});

test("shouldCrossLink returns false when prPrefs is undefined", () => {
  assert.equal(shouldCrossLink(undefined, "linear"), false);
});

// ─── buildLinearReferencesSection ─────────────────────────────────────────────

test("buildLinearReferencesSection returns markdown with Closes for single identifier", () => {
  const section = buildLinearReferencesSection(["KAT-42"]);
  assert.match(section, /## Linear Issues/);
  assert.match(section, /Closes KAT-42/);
});

test("buildLinearReferencesSection returns markdown with Closes for multiple identifiers", () => {
  const section = buildLinearReferencesSection(["KAT-42", "KAT-43", "KAT-44"]);
  assert.match(section, /## Linear Issues/);
  assert.match(section, /Closes KAT-42/);
  assert.match(section, /Closes KAT-43/);
  assert.match(section, /Closes KAT-44/);
});

test("buildLinearReferencesSection returns empty string for empty array", () => {
  const section = buildLinearReferencesSection([]);
  assert.equal(section, "");
});

test("buildLinearReferencesSection returns empty string for undefined", () => {
  const section = buildLinearReferencesSection(undefined);
  assert.equal(section, "");
});

// ─── composePRBody integration (Linear references parameter) ──────────────────

test("composePRBody includes Linear Issues section when linearReferences provided", async () => {
  // Import composePRBody — this tests the extended signature
  const { composePRBody } = await import("../../pr-lifecycle/pr-body-composer.js");

  // Use a non-existent slice path so we get fallback content, but can still
  // verify the Linear references section is appended
  const body = await composePRBody("M999", "S99", "/tmp/nonexistent-kata-project", {
    linearReferences: ["KAT-42"],
  });

  assert.match(body, /## Linear Issues/, "body must include Linear Issues section");
  assert.match(body, /Closes KAT-42/, "body must include Closes reference");
});

test("composePRBody does not include Linear section when linearReferences is empty", async () => {
  const { composePRBody } = await import("../../pr-lifecycle/pr-body-composer.js");

  const body = await composePRBody("M999", "S99", "/tmp/nonexistent-kata-project", {
    linearReferences: [],
  });

  assert.doesNotMatch(body, /## Linear Issues/, "body must not include Linear Issues section when empty");
});

test("composePRBody does not include Linear section when no options provided", async () => {
  const { composePRBody } = await import("../../pr-lifecycle/pr-body-composer.js");

  const body = await composePRBody("M999", "S99", "/tmp/nonexistent-kata-project");

  assert.doesNotMatch(body, /## Linear Issues/, "body must not include Linear Issues section by default");
});
