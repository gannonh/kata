#!/usr/bin/env node

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
import { GrepNotFoundError, type SymbolKind } from "./types.js";
import {
  output,
  formatHeader,
  formatKeyValue,
  formatTable,
  type OutputOptions,
} from "./formatters.js";

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
  .description("Index a project into the knowledge graph")
  .action(async (pathArg: string, _opts: unknown, cmd: Command) => {
    const rootPath = resolve(pathArg);
    const outputOpts = getOutputOptions(cmd);
    const dbPath = getDbPath(cmd, rootPath);

    try {
      if (!existsSync(rootPath)) {
        console.error(`Error: path does not exist: ${rootPath}`);
        process.exit(1);
      }

      const config = loadConfig(rootPath);
      const result = indexProject(rootPath, { dbPath, config });

      const jsonData = {
        filesIndexed: result.filesIndexed,
        symbolsExtracted: result.symbolsExtracted,
        edgesCreated: result.edgesCreated,
        duration: result.duration,
        errors: result.errors,
        dbPath,
      };

      const quietLines = [String(result.filesIndexed)];

      const humanFn = () => {
        const lines: string[] = [];
        lines.push(formatHeader("Index Complete"));
        lines.push(
          formatKeyValue([
            ["Files indexed", result.filesIndexed],
            ["Symbols extracted", result.symbolsExtracted],
            ["Edges created", result.edgesCreated],
            ["Duration", `${result.duration}ms`],
            ["Database", dbPath],
          ]),
        );

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
  .action((_opts: unknown, cmd: Command) => {
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

        const jsonData = {
          symbols: stats.symbols,
          edges: stats.edges,
          files: stats.files,
          lastIndexedSha: lastSha,
          dbPath,
        };

        const quietLines = [
          `${stats.symbols} symbols`,
          `${stats.edges} edges`,
          `${stats.files} files`,
        ];

        const humanFn = () => {
          const lines: string[] = [];
          lines.push(formatHeader("Graph Status"));
          lines.push(
            formatKeyValue([
              ["Symbols", stats.symbols],
              ["Edges", stats.edges],
              ["Files", stats.files],
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
            lines.push(`  ${r.filePath}:${r.lineNumber}:${r.columnNumber}  ${r.lineContent}`);
            for (const ctx of r.contextBefore) {
              lines.push(`    | ${ctx}`);
            }
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

// ── Export for testing ──

export { program };

// ── Parse and run (only when executed directly) ──

// Detect if this module is the main entry point
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("cli.js") || process.argv[1].endsWith("cli.ts"));

if (isMain) {
  program.parse();
}
