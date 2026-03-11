/**
 * Runtime-neutral helper logic for browser-tools.
 *
 * Kept free of pi-specific imports so it can be exercised with node:test.
 */

export function createActionTimeline(limit = 60) {
  return {
    limit,
    nextId: 1,
    entries: [],
  };
}

export function beginAction(timeline, partial) {
  const entry = {
    id: timeline.nextId++,
    tool: partial.tool,
    paramsSummary: partial.paramsSummary ?? "",
    startedAt: partial.startedAt ?? Date.now(),
    finishedAt: null,
    status: "running",
    beforeUrl: partial.beforeUrl ?? "",
    afterUrl: partial.afterUrl ?? "",
    verificationSummary: partial.verificationSummary,
    warningSummary: partial.warningSummary,
    diffSummary: partial.diffSummary,
    changed: partial.changed,
    error: partial.error,
  };
  timeline.entries.push(entry);
  if (timeline.entries.length > timeline.limit) {
    timeline.entries.splice(0, timeline.entries.length - timeline.limit);
  }
  return entry;
}

export function finishAction(timeline, actionId, updates = {}) {
  const entry = timeline.entries.find((item) => item.id === actionId);
  if (!entry) return null;
  Object.assign(entry, updates, {
    finishedAt: updates.finishedAt ?? Date.now(),
    status: updates.status ?? entry.status ?? "success",
    afterUrl: updates.afterUrl ?? entry.afterUrl ?? "",
    verificationSummary: updates.verificationSummary ?? entry.verificationSummary,
    warningSummary: updates.warningSummary ?? entry.warningSummary,
    diffSummary: updates.diffSummary ?? entry.diffSummary,
    changed: updates.changed ?? entry.changed,
    error: updates.error ?? entry.error,
  });
  return entry;
}

export function findAction(timeline, actionId) {
  return timeline.entries.find((item) => item.id === actionId) ?? null;
}

export function toActionParamsSummary(params) {
  if (!params || typeof params !== "object") return "";
  const entries = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      entries.push(`${key}=${JSON.stringify(value.length > 60 ? `${value.slice(0, 57)}...` : value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      entries.push(`${key}=[${value.length}]`);
      continue;
    }
    if (typeof value === "object") {
      entries.push(`${key}={...}`);
      continue;
    }
    entries.push(`${key}=${String(value)}`);
  }
  return entries.slice(0, 6).join(", ");
}

export function diffCompactStates(before, after) {
  const changes = [];
  if (!before || !after) {
    return {
      changed: false,
      changes: [],
      summary: "Diff unavailable",
    };
  }

  if (before.url !== after.url) {
    changes.push({ type: "url", before: before.url, after: after.url });
  }
  if (before.title !== after.title) {
    changes.push({ type: "title", before: before.title, after: after.title });
  }
  if (before.focus !== after.focus) {
    changes.push({ type: "focus", before: before.focus, after: after.focus });
  }
  if ((before.dialog?.count ?? 0) !== (after.dialog?.count ?? 0)) {
    changes.push({
      type: "dialog_count",
      before: before.dialog?.count ?? 0,
      after: after.dialog?.count ?? 0,
    });
  }
  if ((before.dialog?.title ?? "") !== (after.dialog?.title ?? "")) {
    changes.push({
      type: "dialog_title",
      before: before.dialog?.title ?? "",
      after: after.dialog?.title ?? "",
    });
  }

  for (const key of ["landmarks", "buttons", "links", "inputs"]) {
    const beforeValue = before.counts?.[key] ?? 0;
    const afterValue = after.counts?.[key] ?? 0;
    if (beforeValue !== afterValue) {
      changes.push({ type: `count:${key}`, before: beforeValue, after: afterValue });
    }
  }

  const beforeHeadings = JSON.stringify(before.headings ?? []);
  const afterHeadings = JSON.stringify(after.headings ?? []);
  if (beforeHeadings !== afterHeadings) {
    changes.push({
      type: "headings",
      before: before.headings ?? [],
      after: after.headings ?? [],
    });
  }

  const beforeBody = before.bodyText ?? "";
  const afterBody = after.bodyText ?? "";
  if (beforeBody !== afterBody) {
    changes.push({
      type: "body_text",
      before: beforeBody.slice(0, 120),
      after: afterBody.slice(0, 120),
    });
  }

  const changed = changes.length > 0;
  const summary = changed
    ? changes
        .slice(0, 4)
        .map((change) => {
          if (change.type === "url") return `URL changed to ${change.after}`;
          if (change.type === "title") return `title changed to ${change.after}`;
          if (change.type === "focus") return `focus changed`;
          if (change.type === "dialog_count") return `dialog count ${change.before}→${change.after}`;
          if (change.type.startsWith("count:")) return `${change.type.slice(6)} ${change.before}→${change.after}`;
          if (change.type === "headings") return "headings changed";
          if (change.type === "body_text") return "visible text changed";
          return `${change.type} changed`;
        })
        .join("; ")
    : "No meaningful browser-state change detected";

  return { changed, changes, summary };
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

export function includesNeedle(haystack, needle) {
  return normalizeString(haystack).toLowerCase().includes(normalizeString(needle).toLowerCase());
}

// ---------------------------------------------------------------------------
// Threshold parsing for count-based assertions
// ---------------------------------------------------------------------------

/**
 * Parse a threshold expression like ">=3", "==0", "<5", or bare "3" (defaults to ">=").
 * @param {string} value
 * @returns {{ op: string, n: number } | null} — null if malformed
 */
export function parseThreshold(value) {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === "") return null;
  const match = str.match(/^(>=|<=|==|>|<)?\s*(\d+)$/);
  if (!match) return null;
  const op = match[1] || ">=";
  const n = parseInt(match[2], 10);
  return { op, n };
}

/**
 * Evaluate whether a count meets a parsed threshold.
 * @param {number} count
 * @param {{ op: string, n: number }} threshold
 * @returns {boolean}
 */
export function meetsThreshold(count, threshold) {
  switch (threshold.op) {
    case ">=": return count >= threshold.n;
    case "<=": return count <= threshold.n;
    case "==": return count === threshold.n;
    case ">":  return count > threshold.n;
    case "<":  return count < threshold.n;
    default:   return false;
  }
}

/**
 * Filter entries that occurred at or after a given action's start time.
 * If sinceActionId is missing or the action isn't found, returns all entries.
 * @param {Array<{ timestamp?: number }>} entries
 * @param {number | undefined} sinceActionId
 * @param {{ entries: Array<{ id: number, startedAt: number }> }} timeline
 * @returns {Array}
 */
export function getEntriesSince(entries, sinceActionId, timeline) {
  if (!entries || !Array.isArray(entries)) return [];
  if (sinceActionId == null || !timeline) return entries;
  const action = findAction(timeline, sinceActionId);
  if (!action) return entries;
  const since = action.startedAt;
  return entries.filter((e) => (e.timestamp ?? 0) >= since);
}

export function evaluateAssertionChecks({ checks, state }) {
  const results = [];
  const selectorStates = state.selectorStates ?? {};
  const consoleEntries = state.consoleEntries ?? [];
  const networkEntries = state.networkEntries ?? [];
  const allConsoleEntries = state.allConsoleEntries ?? state.consoleEntries ?? [];
  const allNetworkEntries = state.allNetworkEntries ?? state.networkEntries ?? [];
  const actionTimeline = state.actionTimeline ?? null;

  for (const check of checks) {
    const selectorState = check.selector ? selectorStates[check.selector] ?? null : null;
    let passed = false;
    let actual;
    let expected;

    switch (check.kind) {
      case "url_contains":
        actual = state.url ?? "";
        expected = check.value ?? "";
        passed = includesNeedle(actual, expected);
        break;
      case "title_contains":
        actual = state.title ?? "";
        expected = check.value ?? "";
        passed = includesNeedle(actual, expected);
        break;
      case "text_visible":
        actual = state.bodyText ?? "";
        expected = check.text ?? "";
        passed = includesNeedle(actual, expected);
        break;
      case "text_not_visible":
        actual = state.bodyText ?? "";
        expected = check.text ?? "";
        passed = !includesNeedle(actual, expected);
        break;
      case "selector_visible":
        actual = selectorState?.visible ?? false;
        expected = true;
        passed = actual === true;
        break;
      case "selector_hidden":
        actual = selectorState?.visible ?? false;
        expected = false;
        passed = actual === false;
        break;
      case "value_equals":
        actual = selectorState?.value ?? "";
        expected = check.value ?? "";
        passed = actual === expected;
        break;
      case "value_contains":
        actual = selectorState?.value ?? "";
        expected = check.value ?? "";
        passed = includesNeedle(actual, expected);
        break;
      case "focused_matches":
        actual = state.focus ?? "";
        expected = check.value ?? "";
        passed = includesNeedle(actual, expected);
        break;
      case "checked_equals":
        actual = selectorState?.checked ?? null;
        expected = !!check.checked;
        passed = actual === expected;
        break;
      case "no_console_errors":
        actual = consoleEntries.filter((entry) => entry.type === "error" || entry.type === "pageerror").length;
        expected = 0;
        passed = actual === 0;
        break;
      case "no_failed_requests":
        actual = networkEntries.filter((entry) => entry.failed || (typeof entry.status === "number" && entry.status >= 400)).length;
        expected = 0;
        passed = actual === 0;
        break;

      // --- S02: New structured network/console assertion kinds ---

      case "request_url_seen": {
        const filtered = getEntriesSince(allNetworkEntries, check.sinceActionId, actionTimeline);
        const matches = filtered.filter((e) => includesNeedle(e.url ?? "", check.text ?? ""));
        actual = matches.length > 0;
        expected = true;
        passed = actual === true;
        break;
      }

      case "response_status": {
        const filtered = getEntriesSince(allNetworkEntries, check.sinceActionId, actionTimeline);
        const statusNum = parseInt(check.value, 10);
        const matches = filtered.filter(
          (e) => includesNeedle(e.url ?? "", check.text ?? "") && typeof e.status === "number" && e.status === statusNum
        );
        actual = matches.length > 0 ? `found (status=${matches[0].status})` : `not found`;
        expected = `status=${check.value ?? ""}`;
        passed = matches.length > 0;
        break;
      }

      case "console_message_matches": {
        const filtered = getEntriesSince(allConsoleEntries, check.sinceActionId, actionTimeline);
        const matches = filtered.filter((e) => includesNeedle(e.text ?? "", check.text ?? ""));
        actual = matches.length > 0;
        expected = true;
        passed = actual === true;
        break;
      }

      case "network_count": {
        const filtered = getEntriesSince(allNetworkEntries, check.sinceActionId, actionTimeline);
        const matches = filtered.filter((e) => includesNeedle(e.url ?? "", check.text ?? ""));
        const threshold = parseThreshold(check.value);
        if (!threshold) {
          actual = `invalid threshold: ${check.value}`;
          expected = check.value ?? "";
          passed = false;
        } else {
          actual = `count=${matches.length}`;
          expected = `${threshold.op}${threshold.n}`;
          passed = meetsThreshold(matches.length, threshold);
        }
        break;
      }

      case "console_count": {
        const filtered = getEntriesSince(allConsoleEntries, check.sinceActionId, actionTimeline);
        const matches = filtered.filter((e) => includesNeedle(e.text ?? "", check.text ?? ""));
        const threshold = parseThreshold(check.value);
        if (!threshold) {
          actual = `invalid threshold: ${check.value}`;
          expected = check.value ?? "";
          passed = false;
        } else {
          actual = `count=${matches.length}`;
          expected = `${threshold.op}${threshold.n}`;
          passed = meetsThreshold(matches.length, threshold);
        }
        break;
      }

      case "no_console_errors_since": {
        const filtered = getEntriesSince(allConsoleEntries, check.sinceActionId, actionTimeline);
        const errors = filtered.filter((e) => e.type === "error" || e.type === "pageerror");
        actual = errors.length;
        expected = 0;
        passed = errors.length === 0;
        break;
      }

      case "no_failed_requests_since": {
        const filtered = getEntriesSince(allNetworkEntries, check.sinceActionId, actionTimeline);
        const failures = filtered.filter((e) => e.failed || (typeof e.status === "number" && e.status >= 400));
        actual = failures.length;
        expected = 0;
        passed = failures.length === 0;
        break;
      }

      default:
        actual = "unsupported";
        expected = check.kind;
        passed = false;
        break;
    }

    results.push({
      name: check.kind,
      passed,
      actual,
      expected,
      selector: check.selector,
      text: check.text,
    });
  }

  const failed = results.filter((result) => !result.passed);
  const verified = failed.length === 0;
  return {
    verified,
    checks: results,
    summary: verified
      ? `PASS (${results.length}/${results.length} checks)`
      : `FAIL (${failed.length}/${results.length} checks failed)`,
    agentHint: verified
      ? "All assertion checks passed"
      : failed[0]
        ? `Investigate ${failed[0].name} (expected ${JSON.stringify(failed[0].expected)}, got ${JSON.stringify(failed[0].actual)})`
        : "Assertion failed",
  };
}

// ---------------------------------------------------------------------------
// Wait-condition validation
// ---------------------------------------------------------------------------

/**
 * All recognized wait conditions with their parameter requirements.
 * Each entry: { needsValue: bool, valueLabel: string, needsThreshold?: bool }
 */
const WAIT_CONDITIONS = {
  // Existing 5 conditions
  selector_visible:   { needsValue: true,  valueLabel: "CSS selector" },
  selector_hidden:    { needsValue: true,  valueLabel: "CSS selector" },
  url_contains:       { needsValue: true,  valueLabel: "URL substring" },
  network_idle:       { needsValue: false, valueLabel: "" },
  delay:              { needsValue: true,  valueLabel: "milliseconds as a string (e.g. '1000')" },

  // New 6 conditions (S03)
  text_visible:       { needsValue: true,  valueLabel: "text to search for" },
  text_hidden:        { needsValue: true,  valueLabel: "text to search for" },
  request_completed:  { needsValue: true,  valueLabel: "URL substring to match" },
  console_message:    { needsValue: true,  valueLabel: "message substring to match" },
  element_count:      { needsValue: true,  valueLabel: "CSS selector", needsThreshold: true },
  region_stable:      { needsValue: true,  valueLabel: "CSS selector" },
};

/**
 * Validate parameters for a browser_wait_for condition.
 * @param {{ condition: string, value?: string, threshold?: string }} params
 * @returns {null | { error: string }} — null if valid, structured error otherwise
 */
export function validateWaitParams(params) {
  const { condition, value, threshold } = params ?? {};

  if (!condition) {
    return { error: "condition is required" };
  }

  const spec = WAIT_CONDITIONS[condition];
  if (!spec) {
    const known = Object.keys(WAIT_CONDITIONS).join(", ");
    return { error: `unknown condition "${condition}". Known conditions: ${known}` };
  }

  if (spec.needsValue && (!value || String(value).trim() === "")) {
    return { error: `${condition} requires a value (${spec.valueLabel})` };
  }

  if (spec.needsThreshold && threshold != null && String(threshold).trim() !== "") {
    const parsed = parseThreshold(threshold);
    if (!parsed) {
      return { error: `${condition} threshold is malformed: "${threshold}". Expected format: >=N, <=N, ==N, >N, <N, or bare N` };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Region-stable script generator
// ---------------------------------------------------------------------------

/**
 * Generate a JS expression string for page.waitForFunction() that detects
 * DOM stability by comparing snapshot hashes across polling intervals.
 *
 * The script stores a snapshot on a namespaced window key. When the snapshot
 * matches the previous value, the region is considered stable.
 *
 * @param {string} selector — CSS selector for the target element
 * @returns {string} — self-contained JS function body suitable for waitForFunction
 */
export function createRegionStableScript(selector) {
  // Create a stable key from the selector (simple hash to avoid special chars)
  const safeKey = Array.from(selector).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) >>> 0;
  const windowKey = `__pw_region_stable_${safeKey}`;

  return `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const snapshot = el.innerHTML.length + '|' + el.childElementCount + '|' + el.innerText.length;
  const prev = window[${JSON.stringify(windowKey)}];
  window[${JSON.stringify(windowKey)}] = snapshot;
  if (prev === undefined) return false;
  return snapshot === prev;
})()`;
}

// ---------------------------------------------------------------------------
// Page Registry — pure-logic operations for multi-page/tab management
// ---------------------------------------------------------------------------

/**
 * Create a fresh page registry.
 * @returns {{ pages: Array, activePageId: number | null, nextId: number }}
 */
export function createPageRegistry() {
  return { pages: [], activePageId: null, nextId: 1 };
}

/**
 * @typedef {{ id: number, page: any, title: string, url: string, opener: number | null }} PageEntry
 */

/**
 * Add a page to the registry. Assigns an auto-incrementing ID.
 * @param {ReturnType<typeof createPageRegistry>} registry
 * @param {{ page: any, title?: string, url?: string, opener?: number | null }} info
 * @returns {PageEntry}
 */
export function registryAddPage(registry, { page, title = "", url = "", opener = null }) {
  const entry = { id: registry.nextId++, page, title, url, opener };
  registry.pages.push(entry);
  return entry;
}

/**
 * Remove a page from the registry by ID.
 * If the removed page was active, falls back to the opener (if still present)
 * or the last remaining page.
 * Orphans any pages whose opener was the removed page (sets their opener to null).
 * @param {ReturnType<typeof createPageRegistry>} registry
 * @param {number} pageId
 * @returns {{ removed: PageEntry, newActiveId: number | null }}
 */
export function registryRemovePage(registry, pageId) {
  const idx = registry.pages.findIndex((p) => p.id === pageId);
  if (idx === -1) {
    const available = registry.pages.map((p) => p.id);
    throw new Error(
      `registryRemovePage: page ${pageId} not found. ` +
        `Available page IDs: [${available.join(", ")}]. ` +
        `Registry size: ${registry.pages.length}.`
    );
  }
  const [removed] = registry.pages.splice(idx, 1);

  // Orphan any pages whose opener was the removed page
  for (const entry of registry.pages) {
    if (entry.opener === pageId) {
      entry.opener = null;
    }
  }

  let newActiveId = registry.activePageId;
  if (registry.activePageId === pageId) {
    if (registry.pages.length === 0) {
      newActiveId = null;
    } else if (removed.opener !== null && registry.pages.some((p) => p.id === removed.opener)) {
      newActiveId = removed.opener;
    } else {
      newActiveId = registry.pages[registry.pages.length - 1].id;
    }
    registry.activePageId = newActiveId;
  }

  return { removed, newActiveId };
}

/**
 * Set the active page by ID. Throws if the page is not in the registry.
 * @param {ReturnType<typeof createPageRegistry>} registry
 * @param {number} pageId
 */
export function registrySetActive(registry, pageId) {
  const entry = registry.pages.find((p) => p.id === pageId);
  if (!entry) {
    const available = registry.pages.map((p) => p.id);
    throw new Error(
      `registrySetActive: page ${pageId} not found. ` +
        `Available page IDs: [${available.join(", ")}]. ` +
        `Registry size: ${registry.pages.length}.`
    );
  }
  registry.activePageId = pageId;
}

/**
 * Get the active page entry. Throws if no active page or active page not found.
 * @param {ReturnType<typeof createPageRegistry>} registry
 * @returns {PageEntry}
 */
export function registryGetActive(registry) {
  if (registry.activePageId === null) {
    throw new Error(
      `registryGetActive: no active page. ` +
        `Registry contains ${registry.pages.length} page(s). ` +
        `Page IDs: [${registry.pages.map((p) => p.id).join(", ")}].`
    );
  }
  const entry = registry.pages.find((p) => p.id === registry.activePageId);
  if (!entry) {
    throw new Error(
      `registryGetActive: activePageId ${registry.activePageId} not found in registry. ` +
        `Available page IDs: [${registry.pages.map((p) => p.id).join(", ")}]. ` +
        `Registry size: ${registry.pages.length}. This indicates stale state.`
    );
  }
  return entry;
}

/**
 * Get a page entry by ID, or null if not found.
 * @param {ReturnType<typeof createPageRegistry>} registry
 * @param {number} pageId
 * @returns {PageEntry | null}
 */
export function registryGetPage(registry, pageId) {
  return registry.pages.find((p) => p.id === pageId) ?? null;
}

/**
 * List all pages (without the raw `page` reference).
 * @param {ReturnType<typeof createPageRegistry>} registry
 * @returns {Array<{ id: number, title: string, url: string, opener: number | null, isActive: boolean }>}
 */
export function registryListPages(registry) {
  return registry.pages.map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    opener: entry.opener,
    isActive: entry.id === registry.activePageId,
  }));
}

// ---------------------------------------------------------------------------
// FIFO Bounded Log Pusher
// ---------------------------------------------------------------------------

/**
 * Create a push function that enforces FIFO eviction at push-time.
 * @param {number} maxSize — maximum number of entries to retain
 * @returns {(array: Array, entry: any) => void}
 */
export function createBoundedLogPusher(maxSize) {
  return function push(array, entry) {
    array.push(entry);
    if (array.length > maxSize) {
      array.splice(0, array.length - maxSize);
    }
  };
}

export async function runBatchSteps({ steps, executeStep, stopOnFailure = true }) {
  const results = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const result = await executeStep(step, i);
    results.push(result);
    if (result.ok === false && stopOnFailure) {
      return {
        ok: false,
        stopReason: "step_failed",
        failedStepIndex: i,
        stepResults: results,
        summary: `Stopped at step ${i + 1} (${step.action})`,
      };
    }
  }
  return {
    ok: true,
    stopReason: null,
    failedStepIndex: null,
    stepResults: results,
    summary: `Completed ${results.length} step(s)`,
  };
}

// ---------------------------------------------------------------------------
// Snapshot Modes — semantic element filtering for browser_snapshot_refs
// ---------------------------------------------------------------------------

/**
 * Pre-defined snapshot modes that filter elements by semantic category.
 * Each mode config defines which elements should be captured.
 *
 * Shape: { tags: string[], roles: string[], selectors: string[],
 *          ariaAttributes: string[], useInteractiveFilter: boolean,
 *          visibleOnly?: boolean, containerExpand?: boolean }
 */
export const SNAPSHOT_MODES = {
  interactive: {
    tags: [],
    roles: [],
    selectors: [],
    ariaAttributes: [],
    useInteractiveFilter: true,
  },
  form: {
    tags: ["input", "select", "textarea", "button", "fieldset", "label", "output", "datalist"],
    roles: ["textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "slider", "spinbutton", "listbox", "option"],
    selectors: ["[contenteditable]"],
    ariaAttributes: [],
    useInteractiveFilter: false,
  },
  dialog: {
    tags: ["dialog"],
    roles: ["dialog", "alertdialog"],
    selectors: ['[role="dialog"]', '[role="alertdialog"]'],
    ariaAttributes: [],
    useInteractiveFilter: false,
    containerExpand: true,
  },
  navigation: {
    tags: ["a", "nav"],
    roles: ["link", "navigation", "menubar", "menu", "menuitem"],
    selectors: [],
    ariaAttributes: [],
    useInteractiveFilter: false,
  },
  errors: {
    tags: [],
    roles: ["alert", "status"],
    selectors: ['[aria-invalid="true"]', '[role="alert"]', '[role="status"]'],
    ariaAttributes: ["aria-invalid", "aria-errormessage"],
    useInteractiveFilter: false,
    containerExpand: true,
  },
  headings: {
    tags: ["h1", "h2", "h3", "h4", "h5", "h6"],
    roles: ["heading"],
    selectors: [],
    ariaAttributes: [],
    useInteractiveFilter: false,
  },
  visible_only: {
    tags: [],
    roles: [],
    selectors: [],
    ariaAttributes: [],
    useInteractiveFilter: false,
    visibleOnly: true,
  },
};

/**
 * Get the snapshot mode config by name.
 * @param {string} mode — mode name (e.g. "form", "dialog", "interactive")
 * @returns {{ tags: string[], roles: string[], selectors: string[], ariaAttributes: string[], useInteractiveFilter: boolean, visibleOnly?: boolean, containerExpand?: boolean } | null}
 */
export function getSnapshotModeConfig(mode) {
  return SNAPSHOT_MODES[mode] ?? null;
}

// ---------------------------------------------------------------------------
// Fingerprint functions — structural identity for ref resolution
// ---------------------------------------------------------------------------

/**
 * Compute a content hash from visible text using djb2.
 * Caller is expected to pre-truncate to ~200 chars and normalize whitespace.
 * @param {string} text — visible text content
 * @returns {string} — hex string hash, or "0" for empty input
 */
export function computeContentHash(text) {
  if (!text) return "0";
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Compute a structural signature from tag, role, and immediate child tag names.
 * Uses djb2 hash on the concatenated string `tag|role|child1,child2,...`.
 * @param {string} tag — element tag name (lowercase)
 * @param {string} role — ARIA role or empty string
 * @param {string[]} childTags — array of immediate child tag names (lowercase)
 * @returns {string} — hex string hash
 */
export function computeStructuralSignature(tag, role, childTags) {
  const input = `${tag}|${role}|${childTags.join(",")}`;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Match two fingerprint objects by contentHash and structuralSignature.
 * Returns true only when both fields are present on both objects and both match.
 * @param {{ contentHash?: string, structuralSignature?: string }} stored
 * @param {{ contentHash?: string, structuralSignature?: string }} candidate
 * @returns {boolean}
 */
export function matchFingerprint(stored, candidate) {
  if (!stored || !candidate) return false;
  if (!stored.contentHash || !stored.structuralSignature) return false;
  if (!candidate.contentHash || !candidate.structuralSignature) return false;
  return stored.contentHash === candidate.contentHash &&
    stored.structuralSignature === candidate.structuralSignature;
}

function formatDurationMs(entry) {
  const startedAt = typeof entry?.startedAt === "number" ? entry.startedAt : null;
  const finishedAt = typeof entry?.finishedAt === "number" ? entry.finishedAt : null;
  if (startedAt == null || finishedAt == null || finishedAt < startedAt) return null;
  return finishedAt - startedAt;
}

function summarizeActionStatus(status) {
  if (status === "error") return "error";
  if (status === "running") return "running";
  return "success";
}

function looksBoundedWarning(value) {
  return /bounded .*history/i.test(String(value ?? ""));
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function formatTimelineEntries(entries = [], options = {}) {
  const retained = options.retained ?? entries.length;
  const totalRecorded = options.totalRecorded ?? retained;
  const bounded = totalRecorded > retained;

  if (!entries.length) {
    return {
      entries: [],
      retained,
      totalRecorded,
      bounded,
      summary: "No browser actions recorded.",
    };
  }

  const formattedEntries = entries.map((entry) => {
    const status = summarizeActionStatus(entry.status);
    const durationMs = formatDurationMs(entry);
    const parts = [
      `#${entry.id ?? "?"}`,
      entry.tool ?? "unknown_tool",
      status,
    ];

    if (durationMs != null) parts.push(`${durationMs}ms`);
    if (entry.paramsSummary) parts.push(entry.paramsSummary);
    if (entry.error) parts.push(entry.error);
    if (entry.verificationSummary) parts.push(entry.verificationSummary);
    if (entry.diffSummary) parts.push(entry.diffSummary);
    if (entry.warningSummary) parts.push(entry.warningSummary);

    return {
      id: entry.id ?? null,
      tool: entry.tool ?? "",
      status,
      durationMs,
      beforeUrl: entry.beforeUrl ?? "",
      afterUrl: entry.afterUrl ?? "",
      line: parts.join(" | "),
    };
  });

  const summary = bounded
    ? `Timeline: showing ${retained} of ${totalRecorded} recorded browser actions; older actions were discarded due to bounded history.`
    : `Timeline: ${retained} browser action${retained === 1 ? "" : "s"} recorded.`;

  return {
    entries: formattedEntries,
    retained,
    totalRecorded,
    bounded,
    summary,
  };
}

export function buildFailureHypothesis(session = {}) {
  const timelineEntries = session.actionTimeline?.entries ?? [];
  const consoleEntries = session.consoleEntries ?? [];
  const networkEntries = session.networkEntries ?? [];
  const dialogEntries = session.dialogEntries ?? [];
  const signals = [];

  for (const entry of timelineEntries) {
    if (entry?.status !== "error") continue;
    if (entry.tool === "browser_wait_for") {
      signals.push({
        category: "wait",
        source: `action#${entry.id ?? "?"}`,
        detail: entry.error || entry.warningSummary || "Wait condition failed",
      });
      continue;
    }
    if (entry.tool === "browser_assert") {
      signals.push({
        category: "assert",
        source: `action#${entry.id ?? "?"}`,
        detail: entry.error || entry.verificationSummary || "Assertion failed",
      });
      continue;
    }
    signals.push({
      category: "action",
      source: `action#${entry.id ?? "?"}`,
      detail: entry.error || `${entry.tool ?? "browser action"} failed`,
    });
  }

  for (const entry of consoleEntries) {
    if (entry?.type !== "error" && entry?.type !== "pageerror") continue;
    signals.push({
      category: "console",
      source: entry.type,
      detail: entry.text || "Console error recorded",
    });
  }

  for (const entry of networkEntries) {
    const failed = entry?.failed || (typeof entry?.status === "number" && entry.status >= 400);
    if (!failed) continue;
    signals.push({
      category: "network",
      source: entry.url || "network request",
      detail: `${entry.url || "request"} failed${typeof entry?.status === "number" ? ` with ${entry.status}` : ""}`,
    });
  }

  for (const entry of dialogEntries) {
    signals.push({
      category: "dialog",
      source: entry?.type || "dialog",
      detail: entry?.message || "Dialog appeared during failure investigation",
    });
  }

  const categories = uniqueStrings(signals.map((signal) => signal.category));
  const hasFailures = categories.length > 0;
  const summary = hasFailures
    ? `Recent failure signals detected across ${categories.join(", ")}.`
    : "No recent failure signals detected.";

  return {
    hasFailures,
    categories,
    summary,
    signals,
  };
}

export function summarizeBrowserSession(session = {}) {
  const actionTimeline = session.actionTimeline ?? { limit: 0, entries: [] };
  const actionEntries = actionTimeline.entries ?? [];
  const retainedActionCount = session.retainedActionCount ?? actionEntries.length;
  const totalActionCount = session.totalActionCount ?? retainedActionCount;
  const pages = session.pages ?? [];
  const consoleEntries = session.consoleEntries ?? [];
  const networkEntries = session.networkEntries ?? [];
  const dialogEntries = session.dialogEntries ?? [];

  const actionStatusCounts = actionEntries.reduce(
    (acc, entry) => {
      const status = summarizeActionStatus(entry.status);
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    { success: 0, error: 0, running: 0 },
  );

  const waitEntries = actionEntries.filter((entry) => entry.tool === "browser_wait_for");
  const assertEntries = actionEntries.filter((entry) => entry.tool === "browser_assert");
  const consoleErrors = consoleEntries.filter((entry) => entry.type === "error" || entry.type === "pageerror");
  const failedRequests = networkEntries.filter((entry) => entry.failed || (typeof entry.status === "number" && entry.status >= 400));
  const activePage = pages.find((page) => page.isActive) ?? pages[0] ?? null;

  const caveats = [];
  if (totalActionCount > retainedActionCount) {
    caveats.push(`Showing ${retainedActionCount} of ${totalActionCount} recorded actions; older actions were discarded due to bounded history.`);
  }
  if (
    actionEntries.some((entry) => looksBoundedWarning(entry.warningSummary) || looksBoundedWarning(entry.error)) ||
    consoleEntries.some((entry) => looksBoundedWarning(entry.text) || looksBoundedWarning(entry.message)) ||
    consoleEntries.length > 0
  ) {
    caveats.push("bounded console history may hide older console events.");
  }
  if (failedRequests.length > 0 || networkEntries.length > 0) {
    caveats.push("bounded network history may hide older requests.");
  }

  const failureHypothesis = buildFailureHypothesis(session);

  if (!actionEntries.length && pages.length === 0 && consoleEntries.length === 0 && networkEntries.length === 0 && dialogEntries.length === 0) {
    return {
      counts: {
        pages: 0,
        actions: { total: 0, retained: 0, success: 0, error: 0, running: 0 },
        waits: { total: 0, success: 0, error: 0, running: 0 },
        assertions: { total: 0, passed: 0, failed: 0, running: 0 },
        consoleErrors: 0,
        failedRequests: 0,
        dialogs: 0,
      },
      activePage: null,
      caveats: [],
      failureHypothesis,
      summary: "No browser session activity recorded.",
    };
  }

  return {
    counts: {
      pages: pages.length,
      actions: {
        total: totalActionCount,
        retained: retainedActionCount,
        success: actionStatusCounts.success,
        error: actionStatusCounts.error,
        running: actionStatusCounts.running,
      },
      waits: {
        total: waitEntries.length,
        success: waitEntries.filter((entry) => summarizeActionStatus(entry.status) === "success").length,
        error: waitEntries.filter((entry) => summarizeActionStatus(entry.status) === "error").length,
        running: waitEntries.filter((entry) => summarizeActionStatus(entry.status) === "running").length,
      },
      assertions: {
        total: assertEntries.length,
        passed: assertEntries.filter((entry) => summarizeActionStatus(entry.status) === "success").length,
        failed: assertEntries.filter((entry) => summarizeActionStatus(entry.status) === "error").length,
        running: assertEntries.filter((entry) => summarizeActionStatus(entry.status) === "running").length,
      },
      consoleErrors: consoleErrors.length,
      failedRequests: failedRequests.length,
      dialogs: dialogEntries.length,
    },
    activePage: activePage
      ? {
          id: activePage.id ?? null,
          title: activePage.title ?? "",
          url: activePage.url ?? "",
        }
      : null,
    caveats,
    failureHypothesis,
    summary: `Session: ${pages.length} page${pages.length === 1 ? "" : "s"}, ${totalActionCount} actions, ${waitEntries.length} wait${waitEntries.length === 1 ? "" : "s"}, ${assertEntries.length} assert${assertEntries.length === 1 ? "" : "s"}.${caveats.length ? ` ${caveats.join(" ")}` : ""}`,
  };
}
