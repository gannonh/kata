import test from "node:test";
import assert from "node:assert/strict";

import { enablePrPreferencesInContent } from "../pr-preferences-content.js";

test("enablePrPreferencesInContent flips pr.enabled false to true inside existing pr block", () => {
  const input = `---
version: 1
pr:
  enabled: false
  auto_create: false
---

# Title
`;

  const result = enablePrPreferencesInContent(input);
  assert.equal(result.enabled, true);
  assert.equal(result.changed, true);
  assert.match(result.content, /pr:\n  enabled: true\n  auto_create: false/);
});

test("enablePrPreferencesInContent does not touch unrelated enabled keys", () => {
  const input = `---
version: 1
workflow:
  enabled: false
---

# Title
`;

  const result = enablePrPreferencesInContent(input);
  assert.equal(result.enabled, true);
  assert.equal(result.changed, true);
  assert.match(result.content, /workflow:\n  enabled: false/);
  assert.match(result.content, /\npr:\n  enabled: true\n  auto_create: false/);
});

test("enablePrPreferencesInContent appends pr block even with blank line after closing frontmatter", () => {
  const input = `---
version: 1
workflow:
  mode: file
---

# Kata Skill Preferences
`;

  const result = enablePrPreferencesInContent(input);
  assert.equal(result.enabled, true);
  assert.equal(result.changed, true);
  assert.match(
    result.content,
    /workflow:\n  mode: file\n\npr:\n  enabled: true\n  auto_create: false\n  base_branch: main\n  review_on_create: false\n  linear_link: false\n---\n\n# Kata Skill Preferences/,
  );
});

test("enablePrPreferencesInContent reports already enabled as unchanged", () => {
  const input = `---
version: 1
pr:
  enabled: true
  auto_create: false
---

# Title
`;

  const result = enablePrPreferencesInContent(input);
  assert.equal(result.enabled, true);
  assert.equal(result.changed, false);
  assert.equal(result.content, input);
});

test("enablePrPreferencesInContent returns enabled=false when no frontmatter exists", () => {
  const input = `# Kata Skill Preferences
No frontmatter here.
`;

  const result = enablePrPreferencesInContent(input);
  assert.equal(result.enabled, false);
  assert.equal(result.changed, false);
  assert.equal(result.content, input);
});
