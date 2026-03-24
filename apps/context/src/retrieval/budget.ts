/**
 * Token budget assembler — greedily fills from ranked items.
 *
 * Slice: S04 — T03
 */

import type { RetrievalItem } from "./types.js";

export interface BudgetAssemblyResult {
  items: RetrievalItem[];
  budgetUsed: number;
  budgetTotal: number;
}

/**
 * Estimate tokens for a string: ceil(chars / 4).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Greedily fill items within a token budget.
 * Items should already be sorted by score (highest first).
 */
export function assembleBudget(
  rankedItems: RetrievalItem[],
  budgetTokens: number,
): BudgetAssemblyResult {
  const selected: RetrievalItem[] = [];
  let used = 0;

  for (const item of rankedItems) {
    const tokens = item.estimatedTokens || estimateTokens(item.content);
    if (used + tokens > budgetTokens && selected.length > 0) {
      // Don't exceed budget (but always include at least one item)
      continue;
    }
    selected.push({ ...item, estimatedTokens: tokens });
    used += tokens;
    if (used >= budgetTokens) break;
  }

  return {
    items: selected,
    budgetUsed: used,
    budgetTotal: budgetTokens,
  };
}
