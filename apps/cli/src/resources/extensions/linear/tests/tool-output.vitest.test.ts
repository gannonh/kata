import { describe, it, expect } from "vitest";
import {
  renderPagedTextField,
  renderPagedInventory,
  renderMutationSummary,
  renderCompactRead,
  renderInventoryResult,
  renderErrorSummary,
  HARDENED_MAX_BYTES,
} from "../tool-output.js";

describe("renderPagedTextField", () => {
  it("uses 1-indexed offsets and emits continuation guidance", () => {
    const body = Array.from({ length: 6 }, (_, i) => `line-${i + 1}`).join("\n");
    const text = renderPagedTextField({
      label: "description",
      body,
      offset: 1,
      limit: 2,
      emptyMessage: "No description.",
    });

    expect(text).toContain("line-1");
    expect(text).toContain("line-2");
    expect(text).toContain("Showing description lines 1-2 of 6. Use offset=3 to continue.");
  });

  it("keeps the final output byte-bounded after appending guidance notes", () => {
    const body = Array.from({ length: 20 }, () => "x".repeat(120)).join("\n");
    const maxBytes = 140;
    const text = renderPagedTextField({
      label: "description",
      body,
      offset: 1,
      limit: 10,
      emptyMessage: "No description.",
      maxBytes,
    });

    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(maxBytes);
  });

  it("rejects offset values below 1", () => {
    expect(() => renderPagedTextField({
      label: "content",
      body: "hello",
      offset: 0,
      limit: 20,
      emptyMessage: "No content.",
    })).toThrow("offset must be >= 1");
  });
});

describe("renderPagedInventory", () => {
  it("pages by item index and explains how to continue", () => {
    const text = renderPagedInventory({
      noun: "documents",
      items: ["a", "b", "c", "d"],
      offset: 2,
      limit: 2,
      renderItem: (item, index) => `${index}. ${item}`,
      omittedFieldsNote: "Document contents omitted from list output. Use kata_read_document to read one document.",
    });

    expect(text).toContain("2. b");
    expect(text).toContain("3. c");
    expect(text).toContain("Showing items 2-3. Use offset=4 to continue.");
    expect(text).toContain("Document contents omitted from list output.");
  });
});

describe("renderMutationSummary", () => {
  it("never echoes a large body and keeps guidance compact", () => {
    const text = renderMutationSummary({
      noun: "Document",
      action: "updated",
      lines: [
        "id: doc-123",
        "title: M001-ROADMAP",
        "content omitted from tool output",
        "Use kata_read_document to inspect content.",
      ],
    });

    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(HARDENED_MAX_BYTES);
    expect(text).toContain("Document updated");
    expect(text).toContain("Use kata_read_document to inspect content.");
  });
});

describe("renderCompactRead", () => {
  it("renders heading, metadata, and paged body output", () => {
    const text = renderCompactRead({
      heading: "Issue KAT-123",
      metadata: ["title: Bug", "state: In Progress"],
      bodyLabel: "description",
      body: "first\nsecond\nthird",
      offset: 2,
      limit: 2,
    });

    expect(text).toContain("Issue KAT-123");
    expect(text).toContain("- title: Bug");
    expect(text).toContain("- state: In Progress");
    expect(text).toContain("second");
    expect(text).toContain("third");
  });
});

describe("renderInventoryResult", () => {
  it("delegates to paged inventory rendering", () => {
    const text = renderInventoryResult({
      noun: "projects",
      items: ["alpha", "beta"],
      renderItem: (item, index) => `${index}. ${item}`,
    });

    expect(text).toContain("1. alpha");
    expect(text).toContain("2. beta");
  });
});

describe("renderErrorSummary", () => {
  it("renders a compact prefixed error message", () => {
    const text = renderErrorSummary("network", "request failed");

    expect(text).toBe("Error (network): request failed");
  });
});
