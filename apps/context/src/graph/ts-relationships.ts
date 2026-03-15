/**
 * TypeScript cross-file relationship extraction.
 *
 * Extracts import declarations, call expressions referencing imported symbols,
 * class heritage (extends/implements), and re-exports from TypeScript ASTs.
 * Resolves import paths to target file paths and matches to symbol IDs.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import Parser from "tree-sitter";
// @ts-expect-error — tree-sitter grammars lack type declarations
import TypeScriptLang from "tree-sitter-typescript/typescript";
// @ts-expect-error — tree-sitter grammars lack type declarations
import TSXLang from "tree-sitter-typescript/tsx";
import type { ParsedFile, Relationship, Symbol } from "../types.js";
import { RelationshipKind, SymbolKind } from "../types.js";
import { generateSymbolId } from "../parser/common.js";

// ── Parser singletons ──

const tsParser = new Parser();
tsParser.setLanguage(TypeScriptLang);

const tsxParser = new Parser();
tsxParser.setLanguage(TSXLang);

// ── Types ──

/** Map from file path → Map<symbolName, symbolId> */
type SymbolLookup = Map<string, Map<string, string>>;

/** Map from file path → symbolId of the default export (if any) */
type DefaultExportLookup = Map<string, string>;

/** Tracked import: local alias → { sourceFile, originalName } */
interface ImportBinding {
  /** Resolved file path of the import source */
  sourceFile: string;
  /** Original exported name in the source file */
  originalName: string;
  /** Symbol ID in the source file (resolved, or null if not found) */
  symbolId: string | null;
  /** Line number of the import statement */
  lineNumber: number;
}

// ── Public API ──

/**
 * Extract cross-file relationships from parsed TypeScript files.
 *
 * Walks each file's AST to find:
 * - Import declarations → `imports` edges
 * - Call expressions using imported symbols → `calls` edges
 * - Class extends → `inherits` edges
 * - Class implements → `implements` edges
 * - Re-exports → `imports` edges
 *
 * @param parsedFiles - Array of already-parsed files (from S01 parsers)
 * @param rootPath - Absolute path to the project root (for module resolution)
 * @returns Array of cross-file relationships
 */
export function extractTsRelationships(
  parsedFiles: ParsedFile[],
  rootPath: string,
): Relationship[] {
  // Build symbol lookup: filePath → Map<name, symbolId>
  const symbolLookup = buildSymbolLookup(parsedFiles);

  // Build default export lookup by scanning ASTs for `export default`
  const defaultExportLookup = buildDefaultExportLookup(parsedFiles, rootPath);

  // Also build a set of all file paths for resolution
  const knownFiles = new Set(parsedFiles.map((f) => f.filePath));

  const relationships: Relationship[] = [];

  for (const file of parsedFiles) {
    if (file.language !== "typescript") continue;

    // Re-parse the source to walk the full AST for relationship nodes
    const source = getSource(file, rootPath);
    if (!source) continue;

    const useTSX = file.filePath.endsWith(".tsx");
    const parser = useTSX ? tsxParser : tsParser;
    const tree = parser.parse(source);
    const root = tree.rootNode;

    // Pass 1: Collect imports (builds localName → ImportBinding map)
    const importBindings = new Map<string, ImportBinding>();
    collectImports(root, file.filePath, rootPath, knownFiles, symbolLookup, defaultExportLookup, importBindings);

    // Emit import edges
    for (const [, binding] of importBindings) {
      if (binding.symbolId) {
        // Find the importing symbol — use the file-level first symbol or a synthetic source
        const sourceSymbolId = findImportingSymbolId(file, binding.originalName);
        relationships.push({
          sourceId: sourceSymbolId ?? generateFileSymbolId(file.filePath),
          targetId: binding.symbolId,
          kind: RelationshipKind.Imports,
          filePath: file.filePath,
          lineNumber: binding.lineNumber,
        });
      }
    }

    // Pass 2: Collect call expressions referencing imported symbols
    collectCalls(root, file, importBindings, symbolLookup, relationships);

    // Pass 3: Collect class heritage (extends/implements)
    collectHeritage(root, file, importBindings, symbolLookup, relationships);

    // Pass 4: Collect re-exports
    collectReExports(root, file.filePath, rootPath, knownFiles, symbolLookup, relationships);
  }

  return relationships;
}

// ── Symbol lookup ──

function buildSymbolLookup(parsedFiles: ParsedFile[]): SymbolLookup {
  const lookup: SymbolLookup = new Map();
  for (const file of parsedFiles) {
    const fileMap = new Map<string, string>();
    for (const sym of file.symbols) {
      // Use the base name (not qualified) for lookup — "greet" not "ClassName.method"
      const baseName = sym.name.includes(".") ? sym.name.split(".").pop()! : sym.name;
      fileMap.set(baseName, sym.id);
      // Also store the full qualified name
      if (sym.name.includes(".")) {
        fileMap.set(sym.name, sym.id);
      }
    }
    lookup.set(file.filePath, fileMap);
  }
  return lookup;
}

/**
 * Build a lookup of default exports: filePath → symbolId.
 * Scans each TS file's AST for `export default function/class` declarations
 * and maps the file to that symbol's ID.
 */
function buildDefaultExportLookup(parsedFiles: ParsedFile[], rootPath: string): DefaultExportLookup {
  const lookup: DefaultExportLookup = new Map();

  for (const file of parsedFiles) {
    if (file.language !== "typescript") continue;

    const source = getSource(file, rootPath);
    if (!source) continue;

    const useTSX = file.filePath.endsWith(".tsx");
    const parser = useTSX ? tsxParser : tsParser;
    const tree = parser.parse(source);
    const root = tree.rootNode;

    for (let i = 0; i < root.namedChildCount; i++) {
      const node = root.namedChild(i)!;
      if (node.type === "export_statement") {
        // Check for `default` keyword
        let hasDefault = false;
        for (let j = 0; j < node.childCount; j++) {
          const child = node.child(j)!;
          if (!child.isNamed && child.text === "default") {
            hasDefault = true;
            break;
          }
        }
        if (!hasDefault) continue;

        // Find the declaration inside: function, class, etc.
        const decl = node.namedChildren[0];
        if (!decl) continue;

        const nameNode = decl.childForFieldName?.("name");
        if (nameNode) {
          const name = nameNode.text;
          // Determine the kind from the declaration type
          let kind: SymbolKind = SymbolKind.Function;
          if (decl.type === "class_declaration" || decl.type === "abstract_class_declaration") {
            kind = SymbolKind.Class;
          }
          const symId = generateSymbolId(file.filePath, name, kind);
          lookup.set(file.filePath, symId);
          break;
        }
      }
    }
  }

  return lookup;
}

// ── Module resolution ──

/**
 * Resolve a TypeScript import specifier to a file path.
 * Tries: exact, .ts, .tsx, /index.ts, /index.tsx
 */
function resolveModulePath(
  specifier: string,
  fromFile: string,
  rootPath: string,
  knownFiles: Set<string>,
): string | null {
  // Only resolve relative imports
  if (!specifier.startsWith(".")) return null;

  const fromDir = dirname(fromFile);
  const basePath = join(fromDir, specifier);

  // Normalize to forward slashes
  const normalized = basePath.replace(/\\/g, "/");

  // Try in order: exact, .ts, .tsx, /index.ts, /index.tsx
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
  ];

  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  // Fallback: try filesystem resolution (for cases where file isn't in parsedFiles)
  for (const candidate of candidates) {
    const absPath = resolve(rootPath, candidate);
    if (existsSync(absPath)) {
      return candidate;
    }
  }

  return null;
}

// ── Import collection ──

function collectImports(
  root: Parser.SyntaxNode,
  filePath: string,
  rootPath: string,
  knownFiles: Set<string>,
  symbolLookup: SymbolLookup,
  defaultExportLookup: DefaultExportLookup,
  importBindings: Map<string, ImportBinding>,
): void {
  for (let i = 0; i < root.namedChildCount; i++) {
    const node = root.namedChild(i)!;

    if (node.type === "import_statement") {
      processImportStatement(node, filePath, rootPath, knownFiles, symbolLookup, defaultExportLookup, importBindings);
    }
  }
}

function processImportStatement(
  node: Parser.SyntaxNode,
  filePath: string,
  rootPath: string,
  knownFiles: Set<string>,
  symbolLookup: SymbolLookup,
  defaultExportLookup: DefaultExportLookup,
  importBindings: Map<string, ImportBinding>,
): void {
  const sourceNode = node.childForFieldName("source");
  if (!sourceNode) return;

  const specifier = stripQuotes(sourceNode.text);
  const resolvedPath = resolveModulePath(specifier, filePath, rootPath, knownFiles);
  if (!resolvedPath) return;

  const lineNumber = node.startPosition.row + 1;
  const fileSymbols = symbolLookup.get(resolvedPath);
  const defaultSymbolId = defaultExportLookup.get(resolvedPath) ?? null;

  // Find the import clause
  for (const child of node.namedChildren) {
    if (child.type === "import_clause") {
      processImportClause(child, resolvedPath, fileSymbols, defaultSymbolId, lineNumber, importBindings);
    }
  }
}

function processImportClause(
  clause: Parser.SyntaxNode,
  sourceFile: string,
  fileSymbols: Map<string, string> | undefined,
  defaultSymbolId: string | null,
  lineNumber: number,
  importBindings: Map<string, ImportBinding>,
): void {
  for (const child of clause.namedChildren) {
    switch (child.type) {
      case "identifier": {
        // Default import: import Foo from './bar'
        const localName = child.text;
        // For default imports, resolve to the default export of the source file
        const symbolId = defaultSymbolId ?? fileSymbols?.get(localName) ?? null;
        importBindings.set(localName, {
          sourceFile,
          originalName: localName,
          symbolId,
          lineNumber,
        });
        break;
      }
      case "named_imports": {
        // Named imports: import { a, b as c } from './bar'
        for (const specifier of child.namedChildren) {
          if (specifier.type === "import_specifier") {
            const nameNode = specifier.childForFieldName("name");
            const aliasNode = specifier.childForFieldName("alias");
            const originalName = nameNode?.text ?? "";
            const localName = aliasNode?.text ?? originalName;
            const symbolId = fileSymbols?.get(originalName) ?? null;
            importBindings.set(localName, {
              sourceFile,
              originalName,
              symbolId,
              lineNumber,
            });
          }
        }
        break;
      }
      case "namespace_import": {
        // Namespace import: import * as ns from './bar'
        const nsName = child.namedChildren.find(c => c.type === "identifier");
        if (nsName) {
          // Store the namespace binding — we'll use it for qualified access like ns.foo
          importBindings.set(nsName.text, {
            sourceFile,
            originalName: "*",
            symbolId: null, // namespace doesn't map to a single symbol
            lineNumber,
          });
        }
        break;
      }
    }
  }
}

// ── Call expression collection ──

function collectCalls(
  root: Parser.SyntaxNode,
  file: ParsedFile,
  importBindings: Map<string, ImportBinding>,
  symbolLookup: SymbolLookup,
  relationships: Relationship[],
): void {
  // Walk all descendants looking for call_expression nodes
  walkTree(root, (node) => {
    if (node.type !== "call_expression") return;

    const funcNode = node.childForFieldName("function");
    if (!funcNode) return;

    const lineNumber = node.startPosition.row + 1;

    if (funcNode.type === "identifier") {
      // Direct call: foo()
      const calledName = funcNode.text;
      const binding = importBindings.get(calledName);
      if (binding?.symbolId) {
        const callerSymbolId = findEnclosingSymbolId(file, lineNumber);
        if (callerSymbolId) {
          relationships.push({
            sourceId: callerSymbolId,
            targetId: binding.symbolId,
            kind: RelationshipKind.Calls,
            filePath: file.filePath,
            lineNumber,
          });
        }
      }
    } else if (funcNode.type === "member_expression") {
      // Qualified call: ns.foo() or obj.method()
      const objectNode = funcNode.childForFieldName("object");
      const propertyNode = funcNode.childForFieldName("property");
      if (objectNode?.type === "identifier" && propertyNode) {
        const nsBinding = importBindings.get(objectNode.text);
        if (nsBinding && nsBinding.originalName === "*") {
          // Namespace access: types.foo()
          const targetSymbols = symbolLookup.get(nsBinding.sourceFile);
          const targetId = targetSymbols?.get(propertyNode.text);
          if (targetId) {
            const callerSymbolId = findEnclosingSymbolId(file, lineNumber);
            if (callerSymbolId) {
              relationships.push({
                sourceId: callerSymbolId,
                targetId,
                kind: RelationshipKind.Calls,
                filePath: file.filePath,
                lineNumber,
              });
            }
          }
        }
      }
    }
  });
}

// ── Class heritage collection ──

function collectHeritage(
  root: Parser.SyntaxNode,
  file: ParsedFile,
  importBindings: Map<string, ImportBinding>,
  symbolLookup: SymbolLookup,
  relationships: Relationship[],
): void {
  walkTree(root, (node) => {
    if (node.type !== "class_declaration" && node.type !== "abstract_class_declaration") return;

    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const className = nameNode.text;
    const classSymbolId = generateSymbolId(file.filePath, className, SymbolKind.Class);

    for (const child of node.namedChildren) {
      if (child.type === "class_heritage") {
        processClassHeritage(child, classSymbolId, file, importBindings, symbolLookup, relationships);
      }
    }
  });
}

function processClassHeritage(
  heritage: Parser.SyntaxNode,
  classSymbolId: string,
  file: ParsedFile,
  importBindings: Map<string, ImportBinding>,
  symbolLookup: SymbolLookup,
  relationships: Relationship[],
): void {
  // heritage contains extends_clause and/or implements_clause
  for (const clause of heritage.namedChildren) {
    if (clause.type === "extends_clause") {
      // extends BaseClass
      const targets = getHeritageTargets(clause);
      for (const target of targets) {
        const targetId = resolveHeritageTarget(target, file, importBindings, symbolLookup);
        if (targetId) {
          relationships.push({
            sourceId: classSymbolId,
            targetId,
            kind: RelationshipKind.Inherits,
            filePath: file.filePath,
            lineNumber: clause.startPosition.row + 1,
          });
        }
      }
    } else if (clause.type === "implements_clause") {
      // implements IFoo, IBar
      const targets = getHeritageTargets(clause);
      for (const target of targets) {
        const targetId = resolveHeritageTarget(target, file, importBindings, symbolLookup);
        if (targetId) {
          relationships.push({
            sourceId: classSymbolId,
            targetId,
            kind: RelationshipKind.Implements,
            filePath: file.filePath,
            lineNumber: clause.startPosition.row + 1,
          });
        }
      }
    }
  }
}

function getHeritageTargets(clause: Parser.SyntaxNode): string[] {
  const targets: string[] = [];
  walkTree(clause, (node) => {
    // Look for type_identifier or identifier nodes that are direct type references
    if (node.type === "type_identifier" || (node.type === "identifier" && node.parent?.type !== "type_arguments")) {
      // Avoid capturing generic type arguments
      if (node.parent?.type === "extends_clause" || 
          node.parent?.type === "implements_clause" ||
          node.parent?.type === "generic_type") {
        if (node.parent?.type === "generic_type" && node === node.parent.namedChildren[0]) {
          targets.push(node.text);
        } else if (node.parent?.type !== "generic_type") {
          targets.push(node.text);
        }
      }
    }
  });
  return targets;
}

function resolveHeritageTarget(
  targetName: string,
  file: ParsedFile,
  importBindings: Map<string, ImportBinding>,
  symbolLookup: SymbolLookup,
): string | null {
  // Check if it's an imported name
  const binding = importBindings.get(targetName);
  if (binding?.symbolId) {
    return binding.symbolId;
  }

  // Check if it's a local symbol
  const localSymbols = symbolLookup.get(file.filePath);
  return localSymbols?.get(targetName) ?? null;
}

// ── Re-export collection ──

function collectReExports(
  root: Parser.SyntaxNode,
  filePath: string,
  rootPath: string,
  knownFiles: Set<string>,
  symbolLookup: SymbolLookup,
  relationships: Relationship[],
): void {
  for (let i = 0; i < root.namedChildCount; i++) {
    const node = root.namedChild(i)!;

    if (node.type === "export_statement") {
      const sourceNode = node.childForFieldName("source");
      if (!sourceNode) continue; // Not a re-export, just a regular export

      const specifier = stripQuotes(sourceNode.text);
      const resolvedPath = resolveModulePath(specifier, filePath, rootPath, knownFiles);
      if (!resolvedPath) continue;

      const lineNumber = node.startPosition.row + 1;
      const fileSymbols = symbolLookup.get(resolvedPath);
      if (!fileSymbols) continue;

      // Find named exports in the re-export
      for (const child of node.namedChildren) {
        if (child.type === "export_clause") {
          for (const specifierNode of child.namedChildren) {
            if (specifierNode.type === "export_specifier") {
              const nameNode = specifierNode.childForFieldName("name");
              const originalName = nameNode?.text ?? "";
              const targetId = fileSymbols.get(originalName);
              if (targetId) {
                relationships.push({
                  sourceId: generateFileSymbolId(filePath),
                  targetId,
                  kind: RelationshipKind.Imports,
                  filePath,
                  lineNumber,
                });
              }
            }
          }
        }
      }
    }
  }
}

// ── Helpers ──

function stripQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, "");
}

/** Walk all descendants of a tree-sitter node. */
function walkTree(node: Parser.SyntaxNode, visitor: (n: Parser.SyntaxNode) => void): void {
  visitor(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    walkTree(node.namedChild(i)!, visitor);
  }
}

/** Generate a synthetic symbol ID for file-level relationships. */
function generateFileSymbolId(filePath: string): string {
  return generateSymbolId(filePath, "<module>", SymbolKind.Module);
}

/** Get source text for a parsed file by reading from disk. */
function getSource(file: ParsedFile, rootPath: string): string | null {
  try {
    const absPath = resolve(rootPath, file.filePath);
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Find the symbol ID of a named import target in a file's symbols.
 * Returns null if no match (e.g. the symbol isn't defined in this file).
 */
function findImportingSymbolId(file: ParsedFile, _name: string): string | null {
  // For import edges, the source is the file-level module
  return null;
}

/**
 * Find the enclosing symbol for a given line number in a parsed file.
 * Used to determine the source of call edges.
 */
function findEnclosingSymbolId(file: ParsedFile, lineNumber: number): string | null {
  // Find the innermost symbol that contains this line
  let bestMatch: Symbol | null = null;
  let bestSize = Infinity;

  for (const sym of file.symbols) {
    if (lineNumber >= sym.lineStart && lineNumber <= sym.lineEnd) {
      const size = sym.lineEnd - sym.lineStart;
      if (size < bestSize) {
        bestSize = size;
        bestMatch = sym;
      }
    }
  }

  return bestMatch?.id ?? null;
}
