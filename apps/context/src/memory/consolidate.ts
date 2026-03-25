/**
 * Memory consolidation — merge related memories via LLM.
 *
 * Loads memories by IDs, merges content via summary provider,
 * creates new consolidated entry, forgets originals, produces git commit.
 *
 * Slice: S03 — Persistent Memory + Git Audit
 * Task: T03 — Implement semantic recall + consolidate
 */

import type { MemoryStore } from "./store.js";
import type { MemoryEntry } from "./types.js";
import { MemoryError, MEMORY_ERROR_CODES } from "./types.js";

export interface ConsolidateMemoriesOptions {
  ids: string[];
  store: MemoryStore;
  /** Optional LLM merge function. If omitted, concatenates content. */
  mergeFn?: (memories: MemoryEntry[]) => Promise<string>;
}

export interface ConsolidateMemoriesResult {
  entry: MemoryEntry;
  mergedCount: number;
}

/**
 * Consolidate multiple memories into one.
 *
 * Loads all requested memories, merges their content (via LLM or concatenation),
 * creates a new consolidated entry with category "learning" and tag "consolidated",
 * then forgets all originals. The MemoryStore handles git commits internally.
 */
export async function consolidateMemories(
  options: ConsolidateMemoriesOptions,
): Promise<ConsolidateMemoriesResult> {
  const { ids, store } = options;

  if (ids.length < 2) {
    throw new MemoryError(
      MEMORY_ERROR_CODES.MEMORY_CONSOLIDATE_TOO_FEW,
      "At least 2 memories required for consolidation",
    );
  }

  // Load all memories
  const memories: MemoryEntry[] = [];
  for (const id of ids) {
    const entry = await store.get(id);
    if (!entry) {
      throw new MemoryError(
        "MEMORY_FILE_NOT_FOUND",
        `Memory not found: ${id}`,
      );
    }
    memories.push(entry);
  }

  // Merge content
  let mergedContent: string;
  if (options.mergeFn) {
    mergedContent = await options.mergeFn(memories);
  } else {
    // Default: concatenate with headers
    mergedContent = memories
      .map((m) => `[${m.category}] ${m.content}`)
      .join("\n\n");
  }

  // Collect all unique tags and sourceRefs from originals
  const allTags = new Set<string>();
  allTags.add("consolidated");
  const allSourceRefs = new Set<string>();
  for (const m of memories) {
    for (const t of m.tags) allTags.add(t);
    for (const r of m.sourceRefs) allSourceRefs.add(r);
  }

  // Use store.consolidate() which handles file operations + git commit
  const entry = await store.consolidate({
    memoryIds: ids,
    mergedContent,
    category: "learning",
    tags: [...allTags],
    sourceRefs: [...allSourceRefs],
  });

  return {
    entry,
    mergedCount: ids.length,
  };
}
