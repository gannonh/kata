#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * kata-context CLI entry point.
 *
 * Commands:
 *   index [path]   — Index a project into the knowledge graph
 *   status         — Show graph statistics
 *
 * Global options:
 *   --json         — Output structured JSON
 *   --quiet        — Minimal output (one item per line)
 *   --db <path>    — Path to the SQLite database
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Command } from "commander";
import { indexProject } from "./indexer.js";
import { loadConfig } from "./config.js";
import { GraphStore } from "./graph/store.js";
import {
  resolveSymbol,
  dependents,
  dependencies,
  symbolsInFile,
} from "./graph/queries.js";
import { grepSearch, fuzzyFind } from "./search/lexical.js";
import { semanticSearch } from "./search/semantic.js";
import {
  GrepNotFoundError,
  SymbolKind,
  type SemanticRunDiagnostics,
} from "./types.js";
import { SemanticDomainError } from "./semantic/contracts.js";
import {
  output,
  formatHeader,
  formatKeyValue,
  formatTable,
  formatSemanticDiagnosticHint,
  formatSemanticDiagnostics,
  type OutputOptions,
} from "./formatters.js";
import { MemoryStore, MemoryError } from "./memory/index.js";
import { recallMemories } from "./memory/recall.js";
import { consolidateMemories } from "./memory/consolidate.js";

// ── Version ──

// Read version from package.json at build time — fallback to 0.0.0
let VERSION = "0.0.0";
try {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version: string };
  VERSION = pkg.version;
} catch {
  // Fallback — package.json not resolvable at runtime
}

// ── Default DB path ──

const DEFAULT_DB_DIR = ".kata/index";
const DEFAULT_DB_NAME = "graph.db";

function defaultDbPath(rootPath: string): string {
  return resolve(rootPath, DEFAULT_DB_DIR, DEFAULT_DB_NAME);
}

// ── Helpers ──

function getOutputOptions(cmd: Command): OutputOptions {
  const opts = cmd.optsWithGlobals();
  return {
    json: opts.json ?? false,
    quiet: opts.quiet ?? false,
  };
}

function getDbPath(cmd: Command, rootPath?: string): string {
  const opts = cmd.optsWithGlobals();
  if (opts.db) return resolve(opts.db);
  return defaultDbPath(rootPath ?? process.cwd());
}

export function semanticRemediationForCode(errorCode?: string): string {
  return formatSemanticDiagnosticHint(errorCode);
}

function withSemanticHint(
  semantic: SemanticRunDiagnostics | undefined,
): SemanticRunDiagnostics | undefined {
  if (!semantic) return undefined;
  return {
    ...semantic,
    hint: semantic.hint ?? semanticRemediationForCode(semantic.errorCode),
  };
}

// ── Program ──

const program = new Command();

program
  .name("kata-context")
  .description(
    "Structural codebase intelligence — index, query, and search code",
  )
  .version(VERSION)
  .option("--json", "Output structured JSON")
  .option("--quiet", "Minimal output (names/paths only)")
  .option("--db <path>", "Path to the SQLite database");

// ── index command ──

program
  .command("index")
  .argument("[path]", "Project root to index", ".")
  .option("--full", "Force full re-index (ignore incremental cache)")
  .description("Index a project into the knowledge graph")
  .action(async (pathArg: string, opts: { full?: boolean }, cmd: Command) => {
    const rootPath = resolve(pathArg);
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd, rootPath);
    const full = opts.full ?? false;

    try {
      if (!existsSync(rootPath)) {
        console.error(`Error: path does not exist: ${rootPath}`);
        process.exit(1);
      }

      const config = loadConfig(rootPath);
      const result = indexProject(rootPath, { dbPath, config, full });

      const semantic = withSemanticHint(result.semantic);

      const jsonData: Record<string, unknown> = {
        filesIndexed: result.filesIndexed,
        symbolsExtracted: result.symbolsExtracted,
        edgesCreated: result.edgesCreated,
        duration: result.duration,
        errors: result.errors,
        incremental: result.incremental,
        semantic,
        dbPath,
      };
      if (result.incremental) {
        jsonData.changedFiles = result.changedFiles;
        jsonData.deletedFiles = result.deletedFiles;
      }

      const quietLines = [String(result.filesIndexed)];

      const humanFn = () => {
        const lines: string[] = [];
        const mode = result.incremental
          ? "Index Complete (incremental)"
          : "Index Complete (full)";
        lines.push(formatHeader(mode));

        const kvPairs: Array<[string, string | number]> = [
          ["Files indexed", result.filesIndexed],
          ["Symbols extracted", result.symbolsExtracted],
          ["Edges created", result.edgesCreated],
          ["Duration", `${result.duration}ms`],
          ["Database", dbPath],
        ];
        if (result.incremental) {
          kvPairs.splice(1, 0, ["Changed files", result.changedFiles ?? 0]);
          kvPairs.splice(2, 0, ["Deleted files", result.deletedFiles ?? 0]);
        }
        lines.push(formatKeyValue(kvPairs));

        lines.push(formatSemanticDiagnostics(semantic));

        if (result.errors.length > 0) {
          lines.push(formatHeader("Errors"));
          for (const err of result.errors) {
            lines.push(`  ${err.filePath}: ${err.error}`);
          }
        }

        return lines.join("\n");
      };

      output(jsonData, quietLines, humanFn, outputOpts);
    } catch (err) {
      if (outputOpts.json) {
        console.log(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } else {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      process.exit(1);
    }
  });

// ── status command ──

program
  .command("status")
  .description("Show knowledge graph statistics")
  .action(async (_opts: unknown, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd);

    try {
      if (!existsSync(dbPath)) {
        if (outputOpts.json) {
          console.log(
            JSON.stringify({ error: "No database found. Run `kata-context index` first." }),
          );
        } else {
          console.error(
            `Error: No database found at ${dbPath}\nRun \`kata-context index\` first.`,
          );
        }
        process.exit(1);
      }

      const store = new GraphStore(dbPath);
      try {
        const stats = store.getStats();
        const lastSha = store.getLastIndexedSha();

        // Count memories
        let memoryCount = 0;
        try {
          const memStore = new MemoryStore(process.cwd());
          memoryCount = (await memStore.list()).length;
        } catch {
          // Memory dir may not exist yet
        }

        const jsonData = {
          symbols: stats.symbols,
          edges: stats.edges,
          files: stats.files,
          memories: memoryCount,
          lastIndexedSha: lastSha,
          dbPath,
        };

        const quietLines = [
          `${stats.symbols} symbols`,
          `${stats.edges} edges`,
          `${stats.files} files`,
          `${memoryCount} memories`,
        ];

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader("Graph Status"));
          lines.push(
            formatKeyValue([
              ["Symbols", stats.symbols],
              ["Edges", stats.edges],
              ["Files", stats.files],
              ["Memories", memoryCount],
              ["Last indexed SHA", lastSha ?? "(none)"],
              ["Database", dbPath],
            ]),
          );
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        store.close();
      }
    } catch (err) {
      if (outputOpts.json) {
        console.log(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } else {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      process.exit(1);
    }
  });

// ── graph command group ──

const graphCmd = program
  .command("graph")
  .description("Query the knowledge graph");

// ── graph dependents ──

graphCmd
  .command("dependents")
  .argument("<symbol>", "Symbol name or ID to find dependents of")
  .description("Find all symbols that depend on the given symbol")
  .action((symbolArg: string, _opts: unknown, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd);

    try {
      if (!existsSync(dbPath)) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: "No database found. Run `kata-context index` first." }));
        } else {
          console.error(`Error: No database found at ${dbPath}\nRun \`kata-context index\` first.`);
        }
        process.exit(1);
      }

      const store = new GraphStore(dbPath);
      try {
        // Check for ambiguous symbols
        const resolved = resolveSymbol(store, symbolArg);
        if (resolved.length === 0) {
          if (outputOpts.json) {
            console.log(JSON.stringify({ error: `Symbol not found: ${symbolArg}`, matches: [] }));
          } else if (!outputOpts.quiet) {
            console.error(`Error: Symbol not found: ${symbolArg}`);
          }
          process.exit(1);
        }

        if (resolved.length > 1 && !outputOpts.quiet) {
          // Ambiguous — show all matches for non-quiet modes
          const matchInfo = resolved.map((s) => ({
            name: s.name,
            kind: s.kind,
            file: s.filePath,
            line: s.lineStart,
          }));

          if (outputOpts.json) {
            console.log(JSON.stringify({ error: "Ambiguous symbol", matches: matchInfo }));
            process.exit(1);
          }

          console.error(`Warning: Multiple symbols match "${symbolArg}". Using first match.`);
          console.error(
            resolved
              .map((s, i) => `  ${i + 1}. ${s.name} (${s.kind}) in ${s.filePath}:${s.lineStart}`)
              .join("\n"),
          );
        }

        const result = dependents(store, symbolArg);
        if (!result) {
          if (outputOpts.json) {
            console.log(JSON.stringify({ symbol: null, dependents: [] }));
          } else if (!outputOpts.quiet) {
            console.log("No results found.");
          }
          process.exit(0);
        }

        const jsonData = {
          symbol: {
            name: result.symbol.name,
            kind: result.symbol.kind,
            file: result.symbol.filePath,
            line: result.symbol.lineStart,
          },
          dependents: result.related.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            relationship: r.relationship,
            file: r.filePath,
            line: r.lineNumber,
          })),
        };

        const quietLines = result.related.map(
          (r) => `${r.symbol.name}`,
        );

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader(`Dependents of ${result.symbol.name}`));
          if (result.related.length === 0) {
            lines.push("  No dependents found.");
          } else {
            lines.push(
              formatTable(
                ["Symbol", "Kind", "Relationship", "File", "Line"],
                result.related.map((r) => [
                  r.symbol.name,
                  r.symbol.kind,
                  r.relationship,
                  r.filePath,
                  String(r.lineNumber),
                ]),
              ),
            );
          }
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        store.close();
      }
    } catch (err) {
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── graph dependencies ──

graphCmd
  .command("dependencies")
  .argument("<symbol>", "Symbol name or ID to find dependencies of")
  .description("Find all symbols that the given symbol depends on")
  .action((symbolArg: string, _opts: unknown, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd);

    try {
      if (!existsSync(dbPath)) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: "No database found. Run `kata-context index` first." }));
        } else {
          console.error(`Error: No database found at ${dbPath}\nRun \`kata-context index\` first.`);
        }
        process.exit(1);
      }

      const store = new GraphStore(dbPath);
      try {
        const resolved = resolveSymbol(store, symbolArg);
        if (resolved.length === 0) {
          if (outputOpts.json) {
            console.log(JSON.stringify({ error: `Symbol not found: ${symbolArg}`, matches: [] }));
          } else if (!outputOpts.quiet) {
            console.error(`Error: Symbol not found: ${symbolArg}`);
          }
          process.exit(1);
        }

        if (resolved.length > 1 && !outputOpts.quiet) {
          if (outputOpts.json) {
            const matchInfo = resolved.map((s) => ({
              name: s.name,
              kind: s.kind,
              file: s.filePath,
              line: s.lineStart,
            }));
            console.log(JSON.stringify({ error: "Ambiguous symbol", matches: matchInfo }));
            process.exit(1);
          }

          console.error(`Warning: Multiple symbols match "${symbolArg}". Using first match.`);
          console.error(
            resolved
              .map((s, i) => `  ${i + 1}. ${s.name} (${s.kind}) in ${s.filePath}:${s.lineStart}`)
              .join("\n"),
          );
        }

        const result = dependencies(store, symbolArg);
        if (!result) {
          if (outputOpts.json) {
            console.log(JSON.stringify({ symbol: null, dependencies: [] }));
          } else if (!outputOpts.quiet) {
            console.log("No results found.");
          }
          process.exit(0);
        }

        const jsonData = {
          symbol: {
            name: result.symbol.name,
            kind: result.symbol.kind,
            file: result.symbol.filePath,
            line: result.symbol.lineStart,
          },
          dependencies: result.related.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            relationship: r.relationship,
            file: r.filePath,
            line: r.lineNumber,
          })),
        };

        const quietLines = result.related.map(
          (r) => `${r.symbol.name}`,
        );

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader(`Dependencies of ${result.symbol.name}`));
          if (result.related.length === 0) {
            lines.push("  No dependencies found.");
          } else {
            lines.push(
              formatTable(
                ["Symbol", "Kind", "Relationship", "File", "Line"],
                result.related.map((r) => [
                  r.symbol.name,
                  r.symbol.kind,
                  r.relationship,
                  r.filePath,
                  String(r.lineNumber),
                ]),
              ),
            );
          }
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        store.close();
      }
    } catch (err) {
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── graph symbols ──

graphCmd
  .command("symbols")
  .argument("<file>", "File path to list symbols for")
  .description("List all symbols in a file with edge counts")
  .action((fileArg: string, _opts: unknown, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd);

    try {
      if (!existsSync(dbPath)) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: "No database found. Run `kata-context index` first." }));
        } else {
          console.error(`Error: No database found at ${dbPath}\nRun \`kata-context index\` first.`);
        }
        process.exit(1);
      }

      const store = new GraphStore(dbPath);
      try {
        const results = symbolsInFile(store, fileArg);

        const jsonData = {
          file: fileArg,
          symbols: results.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            lineStart: r.symbol.lineStart,
            lineEnd: r.symbol.lineEnd,
            exported: r.symbol.exported,
            incomingEdges: r.incomingEdges,
            outgoingEdges: r.outgoingEdges,
          })),
        };

        const quietLines = results.map((r) => r.symbol.name);

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader(`Symbols in ${fileArg}`));
          if (results.length === 0) {
            lines.push("  No symbols found.");
          } else {
            lines.push(
              formatTable(
                ["Name", "Kind", "Lines", "Exported", "In", "Out"],
                results.map((r) => [
                  r.symbol.name,
                  r.symbol.kind,
                  `${r.symbol.lineStart}-${r.symbol.lineEnd}`,
                  r.symbol.exported ? "yes" : "no",
                  String(r.incomingEdges),
                  String(r.outgoingEdges),
                ]),
              ),
            );
          }
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        store.close();
      }
    } catch (err) {
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── grep command ──

program
  .command("grep")
  .argument("<pattern>", "Regex pattern to search for")
  .option("--glob <pattern>", "File glob filter (repeatable)", (val: string, prev: string[]) => [...prev, val], [] as string[])
  .option("--context <n>", "Context lines before and after each match", parseInt)
  .option("--case-sensitive", "Force case-sensitive search")
  .option("--max-results <n>", "Maximum number of matches", parseInt)
  .description("Search code with ripgrep")
  .action(async (pattern: string, opts: { glob?: string[]; context?: number; caseSensitive?: boolean; maxResults?: number }, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const rootPath = process.cwd();

    try {
      const results = await grepSearch(pattern, rootPath, {
        globs: opts.glob && opts.glob.length > 0 ? opts.glob : undefined,
        contextLines: opts.context,
        caseSensitive: opts.caseSensitive,
        maxResults: opts.maxResults,
      });

      const jsonData = {
        pattern,
        matches: results.map((r) => ({
          file: r.filePath,
          line: r.lineNumber,
          column: r.columnNumber,
          matchText: r.matchText,
          lineContent: r.lineContent,
          contextBefore: r.contextBefore,
          contextAfter: r.contextAfter,
        })),
        totalMatches: results.length,
      };

      const quietLines = results.map(
        (r) => `${r.filePath}:${r.lineNumber}`,
      );

      const humanFn = () => {
        const lines: string[] = [];
        lines.push(formatHeader(`Grep: ${pattern}`));
        if (results.length === 0) {
          lines.push("  No matches found.");
        } else {
          for (const r of results) {
            for (const ctx of r.contextBefore) {
              lines.push(`    | ${ctx}`);
            }
            lines.push(`  ${r.filePath}:${r.lineNumber}:${r.columnNumber}  ${r.lineContent}`);
            for (const ctx of r.contextAfter) {
              lines.push(`    | ${ctx}`);
            }
          }
          lines.push(`\n  ${results.length} match${results.length === 1 ? "" : "es"} found.`);
        }
        return lines.join("\n");
      };

      output(jsonData, quietLines, humanFn, outputOpts);
    } catch (err) {
      if (err instanceof GrepNotFoundError) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: err.message }));
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── search command ──

program
  .command("search")
  .argument("<query>", "Natural language search query")
  .option("--top-k <n>", "Number of results to return", "10")
  .option("--kind <kind>", "Filter results by symbol kind (Function, Class, Method, etc.)")
  .description("Semantic search over indexed symbol embeddings")
  .action(async (query: string, opts: { topK?: string; kind?: string }, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd);

    try {
      if (!existsSync(dbPath)) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: "No database found. Run `kata-context index` first." }));
        } else {
          console.error(`Error: No database found at ${dbPath}\nRun \`kata-context index\` first.`);
        }
        process.exit(1);
      }

      const store = new GraphStore(dbPath);
      try {
        const rootPath = process.cwd();
        const config = loadConfig(rootPath);
        const topK = opts.topK ? parseInt(opts.topK, 10) : 10;
        const kindFilter = opts.kind as SymbolKind | undefined;

        // Validate --kind if provided
        if (kindFilter && !Object.values(SymbolKind).includes(kindFilter)) {
          const validKinds = Object.values(SymbolKind).join(", ");
          if (outputOpts.json) {
            console.log(JSON.stringify({ error: `Invalid symbol kind: "${kindFilter}". Valid kinds: ${validKinds}` }));
          } else {
            console.error(`Error: Invalid symbol kind: "${kindFilter}"\nValid kinds: ${validKinds}`);
          }
          process.exit(1);
        }

        const results = await semanticSearch(query, store, config, {
          topK,
          kind: kindFilter,
        });

        const invariant = store.getSemanticVectorInvariant();
        const totalVectors = store.countSemanticVectors();

        const jsonData = {
          query,
          results: results.map((r, idx) => ({
            rank: idx + 1,
            score: r.score,
            distance: r.distance,
            symbol: {
              id: r.symbol.id,
              name: r.symbol.name,
              kind: r.symbol.kind,
              filePath: r.symbol.filePath,
              lineStart: r.symbol.lineStart,
              lineEnd: r.symbol.lineEnd,
              signature: r.symbol.signature,
              summary: r.symbol.summary,
            },
          })),
          model: invariant?.model ?? null,
          totalVectors,
          totalResults: results.length,
        };

        const quietLines = results.map(
          (r) => `${r.symbol.filePath}:${r.symbol.lineStart}`,
        );

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader(`Semantic Search: "${query}"`));
          if (results.length === 0) {
            lines.push("  No results found.");
          } else {
            lines.push(
              formatKeyValue([
                ["Model", invariant?.model ?? "unknown"],
                ["Total vectors", totalVectors],
                ["Results shown", results.length],
              ]),
            );
            lines.push("");
            lines.push(
              formatTable(
                ["#", "Score", "Name", "Kind", "File", "Lines"],
                results.map((r, idx) => [
                  String(idx + 1),
                  r.score.toFixed(4),
                  r.symbol.name,
                  r.symbol.kind,
                  r.symbol.filePath,
                  `${r.symbol.lineStart}-${r.symbol.lineEnd}`,
                ]),
              ),
            );
          }
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        store.close();
      }
    } catch (err) {
      if (err instanceof SemanticDomainError) {
        const hint = semanticRemediationForCode(err.code);
        if (outputOpts.json) {
          console.log(JSON.stringify({
            error: true,
            code: err.code,
            message: err.message,
            hint,
          }));
        } else {
          console.error(`Error: ${err.message}`);
          if (hint) {
            console.error(`Hint: ${hint}`);
          }
        }
        process.exit(1);
      }
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── find command ──

program
  .command("find")
  .argument("<query>", "Fuzzy search query for symbol/file names")
  .option("--kind <kind>", "Filter results to a specific symbol kind")
  .option("--limit <n>", "Maximum number of results", parseInt)
  .description("Fuzzy find symbols and files via FTS5")
  .action((query: string, opts: { kind?: string; limit?: number }, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd);

    try {
      if (!existsSync(dbPath)) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: "No database found. Run `kata-context index` first." }));
        } else {
          console.error(`Error: No database found at ${dbPath}\nRun \`kata-context index\` first.`);
        }
        process.exit(1);
      }

      const store = new GraphStore(dbPath);
      try {
        const results = fuzzyFind(query, store, {
          kind: opts.kind as SymbolKind | undefined,
          limit: opts.limit,
        });

        const jsonData = {
          query,
          results: results.map((r) => ({
            name: r.symbol.name,
            kind: r.symbol.kind,
            file: r.symbol.filePath,
            lineStart: r.symbol.lineStart,
            lineEnd: r.symbol.lineEnd,
            exported: r.symbol.exported,
          })),
          totalResults: results.length,
        };

        const quietLines = results.map((r) => r.symbol.name);

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader(`Find: ${query}`));
          if (results.length === 0) {
            lines.push("  No results found.");
          } else {
            lines.push(
              formatTable(
                ["Name", "Kind", "File", "Lines"],
                results.map((r) => [
                  r.symbol.name,
                  r.symbol.kind,
                  r.symbol.filePath,
                  `${r.symbol.lineStart}-${r.symbol.lineEnd}`,
                ]),
              ),
            );
          }
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        store.close();
      }
    } catch (err) {
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── remember command ──

program
  .command("remember")
  .argument("<content>", "Memory content to store")
  .option("--category <cat>", "Category: decision, pattern, learning", "learning")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--source <refs>", "Source file references")
  .option("--json", "Output structured JSON")
  .option("--quiet", "Minimal output")
  .description("Store a persistent memory entry")
  .action(async (content: string, opts: { category?: string; tags?: string; source?: string }, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const rootPath = process.cwd();

    try {
      const store = new MemoryStore(rootPath);
      const entry = await store.remember({
        content,
        category: opts.category ?? "learning",
        tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [],
        sourceRefs: opts.source ? opts.source.split(",").map((s) => s.trim()) : [],
      });

      const jsonData = {
        id: entry.id,
        category: entry.category,
        tags: entry.tags,
        createdAt: entry.createdAt,
        sourceRefs: entry.sourceRefs,
        content: entry.content,
      };

      const quietLines = [entry.id];

      const humanFn = () => {
        const lines: string[] = [];
        lines.push(formatHeader("Memory Stored"));
        lines.push(
          formatKeyValue([
            ["ID", entry.id],
            ["Category", entry.category],
            ["Tags", entry.tags.join(", ") || "(none)"],
            ["Created", entry.createdAt],
          ]),
        );
        return lines.join("\n");
      };

      output(jsonData, quietLines, humanFn, outputOpts);
    } catch (err) {
      if (err instanceof MemoryError) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: true, code: err.code, message: err.message, hint: `Memory operation failed: ${err.code}` }));
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── recall command ──

program
  .command("recall")
  .argument("<query>", "Natural language recall query")
  .option("--top-k <n>", "Number of results", "5")
  .option("--category <cat>", "Filter by category")
  .option("--json", "Output structured JSON")
  .option("--quiet", "Minimal output")
  .description("Recall memories by semantic similarity")
  .action(async (query: string, opts: { topK?: string; category?: string }, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const rootPath = process.cwd();
    const dbPath = getDbPath(cmd, rootPath);

    try {
      const memStore = new MemoryStore(rootPath);
      const topK = opts.topK ? parseInt(opts.topK, 10) : 5;

      let graphStore: GraphStore | undefined;
      if (existsSync(dbPath)) {
        graphStore = new GraphStore(dbPath);
      }

      try {
        const results = await recallMemories({
          query,
          store: memStore,
          topK,
          graphStore,
        });

        // Post-filter by category if specified
        const filtered = opts.category
          ? results.filter((r) => r.memory.category === opts.category)
          : results;

        const jsonData = {
          query,
          results: filtered.map((r, idx) => ({
            rank: idx + 1,
            id: r.memory.id,
            similarity: r.similarity,
            distance: r.distance,
            category: r.memory.category,
            tags: r.memory.tags,
            content: r.memory.content,
          })),
          totalResults: filtered.length,
        };

        const quietLines = filtered.map(
          (r) => `${r.memory.id}: ${r.memory.content.slice(0, 60).replace(/\n/g, " ")}`,
        );

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader(`Recall: "${query}"`));
          if (filtered.length === 0) {
            lines.push("  No matching memories found.");
          } else {
            lines.push(
              formatTable(
                ["#", "Score", "ID", "Category", "Tags", "Content"],
                filtered.map((r, idx) => [
                  String(idx + 1),
                  r.similarity.toFixed(4),
                  r.memory.id,
                  r.memory.category,
                  r.memory.tags.join(",") || "-",
                  r.memory.content.slice(0, 40).replace(/\n/g, " "),
                ]),
              ),
            );
          }
          return lines.join("\n");
        };

        output(jsonData, quietLines, humanFn, outputOpts);
      } finally {
        graphStore?.close();
      }
    } catch (err) {
      if (err instanceof MemoryError) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: true, code: err.code, message: err.message, hint: `Memory recall failed: ${err.code}` }));
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
      if (err instanceof SemanticDomainError) {
        const hint = semanticRemediationForCode(err.code);
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: true, code: err.code, message: err.message, hint }));
        } else {
          console.error(`Error: ${err.message}`);
          if (hint) console.error(`Hint: ${hint}`);
        }
        process.exit(1);
      }
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── forget command ──

program
  .command("forget")
  .argument("<id>", "Memory ID to remove")
  .option("--json", "Output structured JSON")
  .option("--quiet", "Minimal output")
  .description("Delete a memory entry by ID")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const rootPath = process.cwd();

    try {
      const store = new MemoryStore(rootPath);
      const entry = await store.forget(id);

      const jsonData = {
        id: entry.id,
        deleted: true,
      };

      const quietLines = [entry.id];

      const humanFn = () => {
        const lines: string[] = [];
        lines.push(formatHeader("Memory Deleted"));
        lines.push(
          formatKeyValue([
            ["ID", entry.id],
            ["Category", entry.category],
          ]),
        );
        return lines.join("\n");
      };

      output(jsonData, quietLines, humanFn, outputOpts);
    } catch (err) {
      if (err instanceof MemoryError) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: true, code: err.code, message: err.message, hint: `Memory forget failed: ${err.code}` }));
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── consolidate command ──

program
  .command("consolidate")
  .argument("<ids...>", "Memory IDs to consolidate")
  .option("--json", "Output structured JSON")
  .option("--quiet", "Minimal output")
  .description("Merge multiple memories into one")
  .action(async (ids: string[], _opts: unknown, cmd: Command) => {
    const outputOpts = getOutputOptions(cmd);
    const rootPath = process.cwd();

    try {
      const store = new MemoryStore(rootPath);
      const result = await consolidateMemories({ ids, store });

      const jsonData = {
        id: result.entry.id,
        mergedCount: result.mergedCount,
        category: result.entry.category,
        tags: result.entry.tags,
        content: result.entry.content,
      };

      const quietLines = [result.entry.id];

      const humanFn = () => {
        const lines: string[] = [];
        lines.push(formatHeader("Memories Consolidated"));
        lines.push(
          formatKeyValue([
            ["New ID", result.entry.id],
            ["Merged", `${result.mergedCount} memories`],
            ["Category", result.entry.category],
            ["Tags", result.entry.tags.join(", ")],
          ]),
        );
        return lines.join("\n");
      };

      output(jsonData, quietLines, humanFn, outputOpts);
    } catch (err) {
      if (err instanceof MemoryError) {
        if (outputOpts.json) {
          console.log(JSON.stringify({ error: true, code: err.code, message: err.message, hint: `Consolidation failed: ${err.code}` }));
        } else {
          console.error(`Error: ${err.message}`);
        }
        process.exit(1);
      }
      if (outputOpts.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

// ── Export for testing ──

export { program };

// ── Parse and run (only when executed directly) ──

// Detect if this module is the main entry point
import { fileURLToPath } from "node:url";
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  program.parse();
}
