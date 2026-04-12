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
  const limit = Math.min(opts.limit ?? DEFAULT_TEXT_PAGE_LIMIT, DEFAULT_TEXT_PAGE_LIMIT);
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
  type TruncationResult = ReturnType<typeof truncateHead>;

  const buildFooter = (fitted: TruncationResult): string => {
    const shownStart = offset;
    const shownEnd = shownStart + Math.max(fitted.outputLines - 1, 0);
    const footerParts: string[] = [];

    if (fitted.outputLines === 0) {
      footerParts.push(`[Output limit reached before ${opts.label} line ${shownStart} could be shown. Use offset=${shownStart} to continue.]`);
    } else if (shownEnd < lines.length) {
      footerParts.push(`[Showing ${opts.label} lines ${shownStart}-${shownEnd} of ${lines.length}. Use offset=${shownEnd + 1} to continue.]`);
    }
    if (fitted.truncated && fitted.truncatedBy === "bytes") {
      footerParts.push(`[Truncated to ${formatSize(maxBytes)} while preserving full lines.]`);
    }

    let trimmedParts = [...footerParts];
    while (trimmedParts.length > 0) {
      const candidate = trimmedParts.length > 0 ? "\n\n" + trimmedParts.join("\n") : "";
      if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
        return candidate;
      }
      trimmedParts = trimmedParts.slice(0, -1);
    }

    return "";
  };

  let fitted: TruncationResult = truncation;
  let footer = buildFooter(fitted);

  for (let pass = 0; pass < 3; pass += 1) {
    const footerBytes = Buffer.byteLength(footer, "utf8");
    const bodyBudget = maxBytes - footerBytes;
    const nextFitted: TruncationResult = bodyBudget > 0
      ? truncateHead(selected, { maxLines: limit, maxBytes: bodyBudget })
      : {
        ...truncation,
        content: "",
        outputLines: 0,
        truncated: true,
        truncatedBy: "bytes",
      };
    const nextFooter = buildFooter(nextFitted);

    if (
      nextFitted.content === fitted.content
      && nextFitted.outputLines === fitted.outputLines
      && nextFitted.truncated === fitted.truncated
      && nextFitted.truncatedBy === fitted.truncatedBy
      && nextFooter === footer
    ) {
      fitted = nextFitted;
      footer = nextFooter;
      break;
    }

    fitted = nextFitted;
    footer = nextFooter;
  }

  return fitted.content + footer;
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
  const limit = Math.min(opts.limit ?? DEFAULT_LIST_PAGE_LIMIT, DEFAULT_LIST_PAGE_LIMIT);
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
  const renderedItems = page.map((item, pageIndex) => opts.renderItem(item, startIndex + pageIndex + 1));

  const fitsWithinHardLimit = (value: string): boolean => {
    const lineCount = value.length === 0 ? 0 : value.split("\n").length;
    return lineCount <= DEFAULT_MAX_LINES && Buffer.byteLength(value, "utf8") <= HARDENED_MAX_BYTES;
  };

  const buildSuffix = (shownCount: number, truncatedBySize: boolean): string => {
    const parts: string[] = [];
    const shownEnd = shownCount > 0 ? offset + shownCount - 1 : offset - 1;
    const hasMoreItems = shownEnd < opts.items.length;

    if (hasMoreItems) {
      if (shownCount > 0) {
        parts.push(`[Showing items ${offset}-${shownEnd}. Use offset=${shownEnd + 1} to continue.]`);
      } else {
        parts.push(`[Output limit reached before item ${offset} could be shown. Use offset=${offset} to continue.]`);
      }
    }

    if (truncatedBySize) {
      parts.push(
        `[Additional ${opts.noun} from this page were omitted to preserve continuation instructions within ${DEFAULT_MAX_LINES} lines/${HARDENED_MAX_BYTES} bytes.]`,
      );
    }

    if (opts.omittedFieldsNote) {
      parts.push(opts.omittedFieldsNote);
    }

    return parts.join("\n");
  };

  let shownCount = renderedItems.length;
  while (shownCount >= 0) {
    const body = renderedItems.slice(0, shownCount).join("\n");
    const truncatedBySize = shownCount < renderedItems.length;
    const suffix = buildSuffix(shownCount, truncatedBySize);
    const candidate = body && suffix ? `${body}\n\n${suffix}` : body || suffix;

    if (fitsWithinHardLimit(candidate)) {
      return candidate;
    }

    shownCount -= 1;
  }

  return buildSuffix(0, true);
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
