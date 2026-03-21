/**
 * search_and_read tool — Brave LLM Context API.
 *
 * Single-call web search + page content extraction optimized for AI agents.
 * Unlike search-the-web → fetch_page (two steps), this returns pre-extracted,
 * relevance-scored page content in one API call.
 *
 * Best for: "I need to know about X" — when you want content, not just links.
 * Use search-the-web when you want links/URLs to browse selectively.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

import { LRUTTLCache } from "./cache";
import { fetchWithRetryTimed, HttpError, classifyError, type RateLimitInfo } from "./http";
import { normalizeQuery, extractDomain } from "./url-utils";
import { formatLLMContext, type LLMContextSnippet, type LLMContextSource } from "./format";
import { resolveSearchProvider, getBraveApiKey, braveHeaders, getTavilyApiKey } from "./provider.js";
import type { TavilySearchResponse } from "./tavily.js";

// =============================================================================
// Types
// =============================================================================

interface BraveLLMContextResponse {
  grounding?: {
    generic?: Array<{
      url: string;
      title: string;
      snippets: string[];
    }>;
    poi?: {
      name: string;
      url: string;
      title: string;
      snippets: string[];
    } | null;
    map?: Array<{
      name: string;
      url: string;
      title: string;
      snippets: string[];
    }>;
  };
  sources?: Record<string, {
    title: string;
    hostname: string;
    age: string[] | null;
  }>;
}

interface CachedLLMContext {
  grounding: LLMContextSnippet[];
  sources: Record<string, LLMContextSource>;
  estimatedTokens: number;
}

interface LLMContextDetails {
  query: string;
  sourceCount: number;
  snippetCount: number;
  estimatedTokens: number;
  cached: boolean;
  latencyMs?: number;
  rateLimit?: RateLimitInfo;
  threshold?: string;
  maxTokens?: number;
  provider?: string;
  errorKind?: string;
  error?: string;
  retryAfterMs?: number;
}

// =============================================================================
// Cache
// =============================================================================

// LLM Context cache: max 50 entries, 10-minute TTL
const contextCache = new LRUTTLCache<CachedLLMContext>({ max: 50, ttlMs: 600_000 });
contextCache.startPurgeInterval(60_000);

// =============================================================================
// Helpers
// =============================================================================

/** Rough token estimate: ~4 chars per token for English text. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Budget grounding snippets to fit within a token limit.
 * Trims snippet text from the end to stay within budget.
 */
function budgetGrounding(grounding: LLMContextSnippet[], maxTokens: number): LLMContextSnippet[] {
  const maxChars = maxTokens * 4; // inverse of estimateTokens
  let totalChars = 0;
  const result: LLMContextSnippet[] = [];

  for (const item of grounding) {
    if (totalChars >= maxChars) break;
    const remaining = maxChars - totalChars;
    const snippets: string[] = [];

    for (const snippet of item.snippets) {
      if (totalChars >= maxChars) break;
      if (snippet.length <= remaining - totalChars + (totalChars - totalChars)) {
        // Fits entirely
        snippets.push(snippet);
        totalChars += snippet.length;
      } else {
        // Trim to fit
        const allowance = maxChars - totalChars;
        if (allowance > 100) { // only include if meaningful
          snippets.push(snippet.slice(0, allowance));
          totalChars += allowance;
        }
        break;
      }
    }

    if (snippets.length > 0) {
      result.push({ url: item.url, title: item.title, snippets });
    }
  }

  return result;
}

// =============================================================================
// Tool Registration
// =============================================================================

export function registerLLMContextTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "search_and_read",
    label: "Search & Read",
    description:
      "Search the web AND read page content in a single call. Returns pre-extracted, " +
      "relevance-scored text from multiple pages — no separate fetch_page needed. " +
      "Powered by Brave's LLM Context API. Best when you need content, not just links. " +
      "For selective URL browsing, use search-the-web + fetch_page instead.",
    promptSnippet: "Search and read web page content in one step",
    promptGuidelines: [
      "Use search_and_read when you need actual page content about a topic — it searches and extracts in one call.",
      "Prefer search_and_read over search-the-web + fetch_page when you just need to learn about something.",
      "Use search-the-web when you need to browse specific URLs, control which pages to read, or want just links.",
      "Start with the default maxTokens (8192). Use smaller values (2048-4096) for simple factual queries.",
      "Use threshold='strict' for focused, high-relevance results. Use 'lenient' for broad coverage.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query — what you want to learn about" }),
      maxTokens: Type.Optional(
        Type.Number({
          minimum: 1024,
          maximum: 32768,
          default: 8192,
          description: "Approximate maximum tokens of content to return (default: 8192). Lower = faster + cheaper inference.",
        })
      ),
      maxUrls: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 20,
          default: 10,
          description: "Maximum number of source URLs to include (default: 10).",
        })
      ),
      threshold: Type.Optional(
        StringEnum(["strict", "balanced", "lenient"] as const, {
          description: "Relevance threshold. 'strict' = fewer but more relevant. 'balanced' (default). 'lenient' = broader coverage.",
        })
      ),
      count: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "Maximum search results to consider (default: 20). More = broader but slower.",
        })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Search cancelled." }] };
      }

      const provider = resolveSearchProvider();
      if (!provider) {
        return {
          content: [{ type: "text", text: "Search unavailable: No search API key set. Set BRAVE_API_KEY or TAVILY_API_KEY. Use secure_env_collect to configure." }],
          isError: true,
          details: { errorKind: "auth_error", error: "No search API key set (BRAVE_API_KEY or TAVILY_API_KEY)" } satisfies Partial<LLMContextDetails>,
        };
      }

      const maxTokens = params.maxTokens ?? 8192;
      const maxUrls = params.maxUrls ?? 10;
      const threshold = params.threshold ?? "balanced";
      const count = params.count ?? 20;

      // ------------------------------------------------------------------
      // Cache lookup
      // ------------------------------------------------------------------
      const cacheKey = normalizeQuery(params.query) + `|t:${maxTokens}|u:${maxUrls}|th:${threshold}|c:${count}`;
      const cached = contextCache.get(cacheKey);

      if (cached) {
        const output = formatLLMContext(params.query, cached.grounding, cached.sources, {
          cached: true,
          tokenCount: cached.estimatedTokens,
        });

        const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
        let content = truncation.content;
        if (truncation.truncated) {
          const tempFile = await pi.writeTempFile(output, { prefix: "llm-context-" });
          content += `\n\n[Truncated. Full content: ${tempFile}]`;
        }

        const totalSnippets = cached.grounding.reduce((sum, g) => sum + g.snippets.length, 0);
        const details: LLMContextDetails = {
          query: params.query,
          sourceCount: cached.grounding.length,
          snippetCount: totalSnippets,
          estimatedTokens: cached.estimatedTokens,
          cached: true,
          threshold,
          maxTokens,
        };

        return { content: [{ type: "text", text: content }], details };
      }

      onUpdate?.({ content: [{ type: "text", text: `Searching & reading about "${params.query}"...` }] });

      try {
        let grounding: LLMContextSnippet[];
        let sources: Record<string, LLMContextSource>;
        let estimatedTokens: number;
        let latencyMs: number | undefined;
        let rateLimit: RateLimitInfo | undefined;

        if (provider === 'tavily') {
          // ----------------------------------------------------------------
          // Tavily path: use search with raw_content, then budget
          // ----------------------------------------------------------------
          const tavilyBody: Record<string, unknown> = {
            query: params.query,
            max_results: count,
            include_raw_content: true,
          };

          let timed;
          try {
            timed = await fetchWithRetryTimed("https://api.tavily.com/search", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getTavilyApiKey()}`,
              },
              body: JSON.stringify(tavilyBody),
              signal,
            }, 2);
          } catch (fetchErr) {
            const classified = classifyError(fetchErr);
            return {
              content: [{ type: "text", text: `search_and_read unavailable: ${classified.message}` }],
              details: {
                errorKind: classified.kind,
                error: classified.message,
                retryAfterMs: classified.retryAfterMs,
                query: params.query,
                provider: 'tavily',
              } satisfies Partial<LLMContextDetails>,
              isError: true,
            };
          }

          const data: TavilySearchResponse = await timed.response.json();

          // Convert Tavily results to grounding snippets
          grounding = [];
          sources = {};
          for (const item of data.results) {
            const content = item.raw_content || item.content || "";
            if (content) {
              grounding.push({
                url: item.url,
                title: item.title || "(untitled)",
                snippets: [content],
              });
            }
            // Build sources map
            try {
              const hostname = new URL(item.url).hostname;
              sources[item.url] = {
                title: item.title || "(untitled)",
                hostname,
                age: null,
              };
            } catch { /* invalid URL — skip source entry */ }
          }

          // Budget: respect maxTokens by trimming snippets
          grounding = budgetGrounding(grounding, maxTokens);

          const allText = grounding.map(g => g.snippets.join(" ")).join(" ");
          estimatedTokens = estimateTokens(allText);
          latencyMs = timed.latencyMs;
          rateLimit = timed.rateLimit;
        } else {
          // ----------------------------------------------------------------
          // Brave LLM Context API path (existing logic)
          // ----------------------------------------------------------------
          const url = new URL("https://api.search.brave.com/res/v1/llm/context");
          url.searchParams.append("q", params.query);
          url.searchParams.append("count", String(count));
          url.searchParams.append("maximum_number_of_tokens", String(maxTokens));
          url.searchParams.append("maximum_number_of_urls", String(maxUrls));
          url.searchParams.append("context_threshold_mode", threshold);

          let timed;
          try {
            timed = await fetchWithRetryTimed(url.toString(), {
              method: "GET",
              headers: braveHeaders(),
              signal,
            }, 2);
          } catch (fetchErr) {
            let errorMessage: string | undefined;
            let errorKindOverride: string | undefined;
            if (fetchErr instanceof HttpError && fetchErr.response) {
              try {
                const body = await fetchErr.response.clone().json().catch(() => null);
                if (body?.error?.detail) {
                  errorMessage = body.error.detail;
                  if (body.error.code === "OPTION_NOT_IN_PLAN") {
                    errorKindOverride = "plan_error";
                    errorMessage = `LLM Context API not available on your current Brave plan. ${body.error.detail} Upgrade at https://api-dashboard.search.brave.com/app/subscriptions — or use search-the-web + fetch_page as an alternative.`;
                  }
                }
              } catch { /* body already consumed or parse error — use generic message */ }
            }
            const classified = classifyError(fetchErr);
            const message = errorMessage || classified.message;
            return {
              content: [{ type: "text", text: `search_and_read unavailable: ${message}` }],
              details: {
                errorKind: errorKindOverride || classified.kind,
                error: message,
                retryAfterMs: classified.retryAfterMs,
                query: params.query,
                provider: 'brave',
              } satisfies Partial<LLMContextDetails>,
              isError: true,
            };
          }

          const data: BraveLLMContextResponse = await timed.response.json();

          grounding = [];
          if (data.grounding?.generic) {
            for (const item of data.grounding.generic) {
              if (item.snippets && item.snippets.length > 0) {
                grounding.push({ url: item.url, title: item.title, snippets: item.snippets });
              }
            }
          }
          if (data.grounding?.poi && data.grounding.poi.snippets?.length) {
            grounding.push({
              url: data.grounding.poi.url,
              title: data.grounding.poi.title || data.grounding.poi.name,
              snippets: data.grounding.poi.snippets,
            });
          }
          if (data.grounding?.map) {
            for (const item of data.grounding.map) {
              if (item.snippets?.length) {
                grounding.push({ url: item.url, title: item.title || item.name, snippets: item.snippets });
              }
            }
          }

          sources = {};
          if (data.sources) {
            for (const [sourceUrl, sourceInfo] of Object.entries(data.sources)) {
              sources[sourceUrl] = { title: sourceInfo.title, hostname: sourceInfo.hostname, age: sourceInfo.age };
            }
          }

          const allText = grounding.map(g => g.snippets.join(" ")).join(" ");
          estimatedTokens = estimateTokens(allText);
          latencyMs = timed.latencyMs;
          rateLimit = timed.rateLimit;
        }

        // Cache the results
        contextCache.set(cacheKey, { grounding, sources, estimatedTokens });

        // ------------------------------------------------------------------
        // Format output
        // ------------------------------------------------------------------
        const output = formatLLMContext(params.query, grounding, sources, {
          tokenCount: estimatedTokens,
        });

        const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
        let content = truncation.content;

        if (truncation.truncated) {
          const tempFile = await pi.writeTempFile(output, { prefix: "llm-context-" });
          content += `\n\n[Truncated. Full content: ${tempFile}]`;
        }

        const totalSnippets = grounding.reduce((sum, g) => sum + g.snippets.length, 0);
        const details: LLMContextDetails = {
          query: params.query,
          sourceCount: grounding.length,
          snippetCount: totalSnippets,
          estimatedTokens,
          cached: false,
          latencyMs,
          rateLimit,
          threshold,
          maxTokens,
          provider,
        };

        return { content: [{ type: "text", text: content }], details };
      } catch (error) {
        const classified = classifyError(error);
        return {
          content: [{ type: "text", text: `Search failed: ${classified.message}` }],
          details: {
            errorKind: classified.kind,
            error: classified.message,
            query: params.query,
          } satisfies Partial<LLMContextDetails>,
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("search_and_read "));
      text += theme.fg("muted", `"${args.query}"`);

      const meta: string[] = [];
      if (args.maxTokens && args.maxTokens !== 8192) meta.push(`${(args.maxTokens / 1000).toFixed(0)}k tokens`);
      if (args.threshold && args.threshold !== "balanced") meta.push(`threshold:${args.threshold}`);
      if (args.maxUrls && args.maxUrls !== 10) meta.push(`${args.maxUrls} urls`);
      if (meta.length > 0) {
        text += " " + theme.fg("dim", `(${meta.join(", ")})`);
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as LLMContextDetails | undefined;
      if (details?.errorKind || details?.error) {
        const kindTag = details.errorKind ? theme.fg("dim", ` [${details.errorKind}]`) : "";
        return new Text(theme.fg("error", `✗ ${details.error ?? "Search failed"}`) + kindTag, 0, 0);
      }

      const cacheTag = details?.cached ? theme.fg("dim", " [cached]") : "";
      const latencyTag = details?.latencyMs ? theme.fg("dim", ` ${details.latencyMs}ms`) : "";
      const tokenTag = details?.estimatedTokens
        ? theme.fg("dim", ` ~${(details.estimatedTokens / 1000).toFixed(1)}k tokens`)
        : "";

      let text = theme.fg("success",
        `✓ ${details?.sourceCount ?? 0} sources, ${details?.snippetCount ?? 0} snippets for "${details?.query}"`) +
        tokenTag + cacheTag + latencyTag;

      if (expanded && result.content[0]?.type === "text") {
        const preview = result.content[0].text.split("\n").slice(0, 10).join("\n");
        text += "\n\n" + theme.fg("dim", preview);
      }

      return new Text(text, 0, 0);
    },
  });
}
