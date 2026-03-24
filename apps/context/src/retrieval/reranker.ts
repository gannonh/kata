/**
 * Multi-strategy reranker — normalizes per-strategy scores and applies weights.
 *
 * Slice: S04 — T03
 */

import type { RetrievalItem, RankingWeights } from "./types.js";
import { DEFAULT_RANKING_WEIGHTS } from "./types.js";

interface ScoredCandidate {
  item: RetrievalItem;
  rawScore: number;
  /** File modification recency score 0-1 (not used here, placeholder) */
  recencyScore: number;
}

/**
 * Rerank retrieval items using configurable per-strategy weights.
 *
 * Normalizes raw scores within each strategy to 0-1, then applies
 * weighted combination: structural*w1 + semantic*w2 + recency*w3 + memory*w4.
 */
export function rerankResults(
  items: RetrievalItem[],
  weights?: Partial<RankingWeights>,
): RetrievalItem[] {
  if (items.length === 0) return [];

  const w: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, ...weights };

  // Group by strategy and find min/max for normalization
  const byStrategy = new Map<string, RetrievalItem[]>();
  for (const item of items) {
    const group = byStrategy.get(item.provenance) ?? [];
    group.push(item);
    byStrategy.set(item.provenance, group);
  }

  // Normalize scores per strategy to 0-1
  const normalized = new Map<string, number>(); // item.id -> normalized score
  for (const [, group] of byStrategy) {
    const scores = group.map((i) => i.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;
    for (const item of group) {
      normalized.set(item.id, range > 0 ? (item.score - min) / range : 1.0);
    }
  }

  // Compute combined scores
  const combined: Array<{ item: RetrievalItem; combinedScore: number }> = [];
  for (const item of items) {
    const normScore = normalized.get(item.id) ?? 0;
    const strategyWeight =
      item.provenance === "structural"
        ? w.structural
        : item.provenance === "semantic"
          ? w.semantic
          : w.memory;

    // Recency weight is applied uniformly (no file mtime data here)
    const combinedScore = normScore * strategyWeight + w.recency * 0.5;
    combined.push({ item, combinedScore });
  }

  combined.sort((a, b) => b.combinedScore - a.combinedScore);

  return combined.map(({ item, combinedScore }) => ({
    ...item,
    score: combinedScore,
  }));
}
