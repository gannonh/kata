import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";

export const HARDENED_MAX_BYTES = DEFAULT_MAX_BYTES;
export const DEFAULT_TEXT_PAGE_LIMIT = 200;
export const DEFAULT_LIST_PAGE_LIMIT = 25;

function assertOneIndexedOffset(offset: number) {
  if (!Number.isInteger(offset) || offset < 1) {
    throw new Error("offset must be >= 1");
  }
}

function assertPositiveLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be >= 1");
  }
}

export function renderPagedTextField(opts: {
  label: string;
  body: string | null | undefined;
  offset?: number;
  limit?: number;
  emptyMessage: string;
  maxBytes?: number;
}): string {
  const rawBody = opts.body?.trimEnd() ?? "";
  if (!rawBody) return opts.emptyMessage;

  const offset = opts.offset ?? 1;
  const limit = opts.limit ?? DEFAULT_TEXT_PAGE_LIMIT;
  const maxBytes = opts.maxBytes ?? HARDENED_MAX_BYTES;
  assertOneIndexedOffset(offset);
  assertPositiveLimit(limit);

  const lines = rawBody.split("\n");
  if (offset > lines.length) {
    throw new Error(`offset ${offset} is beyond end of ${opts.label} (${lines.length} lines total)`);
  }

  const startIndex = offset - 1;
  const selected = lines.slice(startIndex, startIndex + limit).join("\n");
  const truncation = truncateHead(selected, {
    maxLines: limit,
    maxBytes,
  });

  const shownStart = offset;
  const shownEnd = shownStart + Math.max(truncation.outputLines - 1, 0);
  let text = truncation.content;

  if (shownEnd < lines.length) {
    text += `\n\n[Showing ${opts.label} lines ${shownStart}-${shownEnd} of ${lines.length}. Use offset=${shownEnd + 1} to continue.]`;
  }

  if (truncation.truncated && truncation.truncatedBy === "bytes") {
    text += `\n[Truncated to ${formatSize(maxBytes)} while preserving full lines.]`;
  }

  return truncateHead(text, {
    maxLines: limit + 4,
    maxBytes,
  }).content;
}

export function renderPagedInventory<T>(opts: {
  noun: string;
  items: T[];
  offset?: number;
  limit?: number;
  renderItem: (item: T, index: number) => string;
  emptyMessage?: string;
  omittedFieldsNote?: string;
}): string {
  const offset = opts.offset ?? 1;
  const limit = opts.limit ?? DEFAULT_LIST_PAGE_LIMIT;
  assertOneIndexedOffset(offset);
  assertPositiveLimit(limit);

  if (opts.items.length === 0) {
    return opts.emptyMessage ?? `No ${opts.noun} found.`;
  }
  if (offset > opts.items.length) {
    throw new Error(`offset ${offset} is beyond end of ${opts.noun} (${opts.items.length} items total)`);
  }

  const startIndex = offset - 1;
  const page = opts.items.slice(startIndex, startIndex + limit);
  const lines = page.map((item, pageIndex) => opts.renderItem(item, startIndex + pageIndex + 1));
  let text = lines.join("\n");
  const shownStart = offset;
  const shownEnd = offset + page.length - 1;

  if (shownEnd < opts.items.length) {
    text += `\n\n[Showing items ${shownStart}-${shownEnd} of ${opts.items.length}. Use offset=${shownEnd + 1} to continue.]`;
  }
  if (opts.omittedFieldsNote) {
    text += `\n${opts.omittedFieldsNote}`;
  }

  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: HARDENED_MAX_BYTES,
  });

  return truncation.content;
}

export function renderMutationSummary(opts: {
  noun: string;
  action: string;
  lines: string[];
}): string {
  const base = [`${opts.noun} ${opts.action}.`, ...opts.lines].join("\n");
  return truncateHead(base, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: HARDENED_MAX_BYTES,
  }).content;
}

export function renderCompactRead(opts: {
  heading: string;
  metadata: string[];
  bodyLabel?: string;
  body?: string | null | undefined;
  offset?: number;
  limit?: number;
  emptyBodyMessage?: string;
}): string {
  const sections = [opts.heading, ...opts.metadata.map((line) => `- ${line}`)];
  if (opts.bodyLabel) {
    sections.push("", renderPagedTextField({
      label: opts.bodyLabel,
      body: opts.body,
      offset: opts.offset,
      limit: opts.limit,
      emptyMessage: opts.emptyBodyMessage ?? `No ${opts.bodyLabel}.`,
    }));
  }
  return truncateHead(sections.join("\n"), {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: HARDENED_MAX_BYTES,
  }).content;
}

export function renderInventoryResult<T>(opts: Parameters<typeof renderPagedInventory<T>>[0]): string {
  return renderPagedInventory(opts);
}

export function renderErrorSummary(kind: string, message: string): string {
  return truncateHead(`Error (${kind}): ${message}`, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: HARDENED_MAX_BYTES,
  }).content;
}
