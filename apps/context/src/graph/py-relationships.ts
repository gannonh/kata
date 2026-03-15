/**
 * Python cross-file relationship extraction.
 *
 * Extracts import statements, from-import statements, and class inheritance
 * from Python ASTs. Resolves import paths within the repo to target symbol IDs.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";
import Parser from "tree-sitter";
import type { ParsedFile, Relationship } from "../types.js";
import { RelationshipKind, SymbolKind } from "../types.js";
import { generateSymbolId } from "../parser/common.js";

// ── Parser singleton ──

const require = createRequire(import.meta.url);
const PythonLang = require("tree-sitter-python") as Parser.Language;
const pyParser = new Parser();
pyParser.setLanguage(PythonLang);

// ── Types ──

/** Map from file path → Map<symbolName, symbolId> */
type SymbolLookup = Map<string, Map<string, string>>;

/** Tracked import: local alias → resolved target info */
interface ImportBinding {
  /** Resolved file path of the import source */
  sourceFile: string;
  /** Original exported name in the source file ("*" for module-level import) */
  originalName: string;
  /** Symbol ID in the source file (resolved, or null if not found) */
  symbolId: string | null;
  /** Line number of the import statement */
  lineNumber: number;
}

// ── Public API ──

/**
 * Extract cross-file relationships from parsed Python files.
 *
 * Walks each file's AST to find:
 * - `import X` statements → `imports` edges
 * - `from X import Y` statements → `imports` edges
 * - `from .X import Y` (relative imports) → `imports` edges
 * - Class inheritance (`class Foo(Bar):`) → `inherits` edges
 *
 * @param parsedFiles - Array of already-parsed files (from S01 parsers)
 * @param rootPath - Absolute path to the project root (for module resolution)
 * @returns Array of cross-file relationships
 */
export function extractPyRelationships(
  parsedFiles: ParsedFile[],
  rootPath: string,
): Relationship[] {
  const symbolLookup = buildSymbolLookup(parsedFiles);
  const knownFiles = new Set(parsedFiles.map((f) => f.filePath));
  const relationships: Relationship[] = [];

  for (const file of parsedFiles) {
    if (file.language !== "python") continue;

    const source = getSource(file, rootPath);
    if (!source) continue;

    const tree = pyParser.parse(source);
    const root = tree.rootNode;

    // Pass 1: Collect imports
    const importBindings = new Map<string, ImportBinding>();
    collectImports(root, file.filePath, rootPath, knownFiles, symbolLookup, importBindings);

    // Emit import edges
    for (const [, binding] of importBindings) {
      if (binding.symbolId) {
        relationships.push({
          sourceId: generateFileSymbolId(file.filePath),
          targetId: binding.symbolId,
          kind: RelationshipKind.Imports,
          filePath: file.filePath,
          lineNumber: binding.lineNumber,
        });
      }
    }

    // Pass 2: Collect class inheritance
    collectInheritance(root, file, importBindings, symbolLookup, relationships);
  }

  return relationships;
}

// ── Symbol lookup ──

function buildSymbolLookup(parsedFiles: ParsedFile[]): SymbolLookup {
  const lookup: SymbolLookup = new Map();
  for (const file of parsedFiles) {
    const fileMap = new Map<string, string>();
    for (const sym of file.symbols) {
      const baseName = sym.name.includes(".")
        ? sym.name.split(".").pop()!
        : sym.name;
      fileMap.set(baseName, sym.id);
      if (sym.name.includes(".")) {
        fileMap.set(sym.name, sym.id);
      }
    }
    lookup.set(file.filePath, fileMap);
  }
  return lookup;
}

// ── Module resolution ──

/**
 * Resolve a Python module name to a file path.
 * `import utils` → `utils.py` or `utils/__init__.py`
 */
function resolveModulePath(
  moduleName: string,
  fromFile: string,
  rootPath: string,
  knownFiles: Set<string>,
): string | null {
  const parts = moduleName.split(".");
  const fromDir = dirname(fromFile);

  // Try relative to importing file's directory
  const relBase = join(fromDir, ...parts);
  for (const candidate of [`${relBase}.py`, join(relBase, "__init__.py")]) {
    const normalized = candidate.replace(/\\/g, "/");
    if (knownFiles.has(normalized)) return normalized;
  }

  // Try from root (absolute import)
  const absBase = join(rootPath, ...parts);
  for (const candidate of [`${absBase}.py`, join(absBase, "__init__.py")]) {
    const stripped = candidate.startsWith(rootPath + "/") ? candidate.slice(rootPath.length + 1) : candidate;
    const normalized = stripped.replace(/\\/g, "/");
    if (knownFiles.has(normalized)) return normalized;
  }

  return null;
}

/**
 * Resolve a relative Python import.
 * `from .utils import helper` → resolve relative to current package
 * `from ..models import User` → resolve relative to parent package
 */
function resolveRelativeImport(
  dots: number,
  moduleName: string | null,
  fromFile: string,
  knownFiles: Set<string>,
): string | null {
  let baseDir = dirname(fromFile);

  // First dot = current package, each additional dot goes up one level
  for (let i = 1; i < dots; i++) {
    baseDir = dirname(baseDir);
  }

  if (moduleName) {
    const parts = moduleName.split(".");
    const base = join(baseDir, ...parts);
    for (const candidate of [`${base}.py`, join(base, "__init__.py")]) {
      const normalized = candidate.replace(/\\/g, "/");
      if (knownFiles.has(normalized)) return normalized;
    }
  } else {
    const candidate = join(baseDir, "__init__.py").replace(/\\/g, "/");
    if (knownFiles.has(candidate)) return candidate;
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
  importBindings: Map<string, ImportBinding>,
): void {
  for (let i = 0; i < root.namedChildCount; i++) {
    const node = root.namedChild(i)!;
    if (node.type === "import_statement") {
      processImportStatement(node, filePath, rootPath, knownFiles, importBindings);
    } else if (node.type === "import_from_statement") {
      processImportFromStatement(node, filePath, rootPath, knownFiles, symbolLookup, importBindings);
    }
  }
}

/**
 * Process `import X` and `import X as Y` statements.
 */
function processImportStatement(
  node: Parser.SyntaxNode,
  filePath: string,
  rootPath: string,
  knownFiles: Set<string>,
  importBindings: Map<string, ImportBinding>,
): void {
  const lineNumber = node.startPosition.row + 1;

  for (const child of node.namedChildren) {
    let moduleName: string;
    let localName: string;

    if (child.type === "dotted_name") {
      moduleName = child.text;
      localName = child.text;
    } else if (child.type === "aliased_import") {
      const nameNode = child.childForFieldName("name");
      const aliasNode = child.childForFieldName("alias");
      moduleName = nameNode?.text ?? "";
      localName = aliasNode?.text ?? moduleName;
    } else {
      continue;
    }

    const resolvedPath = resolveModulePath(moduleName, filePath, rootPath, knownFiles);
    if (!resolvedPath) continue;

    importBindings.set(localName, {
      sourceFile: resolvedPath,
      originalName: "*",
      symbolId: generateFileSymbolId(resolvedPath),
      lineNumber,
    });
  }
}

/**
 * Process `from X import Y, Z` and `from .X import Y` statements.
 *
 * AST structure:
 *   import_from_statement
 *     from [anon]
 *     dotted_name "models"          (or relative_import "..models")
 *     import [anon]
 *     dotted_name "BaseModel"       (imported names)
 *     , [anon]
 *     dotted_name "User"
 */
function processImportFromStatement(
  node: Parser.SyntaxNode,
  filePath: string,
  rootPath: string,
  knownFiles: Set<string>,
  symbolLookup: SymbolLookup,
  importBindings: Map<string, ImportBinding>,
): void {
  const lineNumber = node.startPosition.row + 1;

  // Step 1: Find the module reference and resolve it.
  // Use the raw children to find the module part (before `import` keyword)
  // and imported names (after `import` keyword).
  let moduleName: string | null = null;
  let dotCount = 0;
  let importKeywordSeen = false;
  const importedNames: Array<{ original: string; local: string }> = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;

    if (!child.isNamed && child.text === "import") {
      importKeywordSeen = true;
      continue;
    }

    if (!importKeywordSeen) {
      // Before `import` keyword — this is the module part
      if (child.type === "relative_import") {
        // Relative import: count dots and get module name
        for (const relChild of child.children) {
          if (relChild.type === "import_prefix") {
            // Count dots inside import_prefix
            for (const dot of relChild.children) {
              if (!dot.isNamed && dot.text === ".") dotCount++;
            }
          } else if (relChild.type === "dotted_name") {
            moduleName = relChild.text;
          }
        }
      } else if (child.isNamed && child.type === "dotted_name") {
        moduleName = child.text;
      }
    } else {
      // After `import` keyword — these are imported names
      if (child.type === "dotted_name") {
        importedNames.push({ original: child.text, local: child.text });
      } else if (child.type === "aliased_import") {
        const nameNode = child.childForFieldName("name");
        const aliasNode = child.childForFieldName("alias");
        const original = nameNode?.text ?? "";
        const local = aliasNode?.text ?? original;
        importedNames.push({ original, local });
      }
      // Skip commas, wildcards, etc.
    }
  }

  // Step 2: Resolve the module path
  let resolvedPath: string | null;
  if (dotCount > 0) {
    resolvedPath = resolveRelativeImport(dotCount, moduleName, filePath, knownFiles);
  } else if (moduleName) {
    resolvedPath = resolveModulePath(moduleName, filePath, rootPath, knownFiles);
  } else {
    return;
  }

  if (!resolvedPath) return;

  // Step 3: Create bindings for each imported name
  const fileSymbols = symbolLookup.get(resolvedPath);

  for (const { original, local } of importedNames) {
    const symbolId = fileSymbols?.get(original) ?? null;
    importBindings.set(local, {
      sourceFile: resolvedPath,
      originalName: original,
      symbolId,
      lineNumber,
    });
  }
}

// ── Class inheritance collection ──

function collectInheritance(
  root: Parser.SyntaxNode,
  file: ParsedFile,
  importBindings: Map<string, ImportBinding>,
  symbolLookup: SymbolLookup,
  relationships: Relationship[],
): void {
  walkTree(root, (node) => {
    if (node.type !== "class_definition") return;

    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const className = nameNode.text;
    const classSymbolId = generateSymbolId(file.filePath, className, SymbolKind.Class);

    const superclasses = node.childForFieldName("superclasses");
    if (!superclasses) return;

    for (const child of superclasses.namedChildren) {
      if (child.type === "identifier") {
        resolveAndEmitInheritance(
          child.text,
          classSymbolId,
          file,
          importBindings,
          symbolLookup,
          relationships,
          child.startPosition.row + 1,
        );
      } else if (child.type === "attribute") {
        // Qualified access: models.Admin
        const objectNode = child.childForFieldName("object");
        const attrNode = child.childForFieldName("attribute");
        if (objectNode && attrNode) {
          const binding = importBindings.get(objectNode.text);
          if (binding && binding.originalName === "*") {
            const targetSymbols = symbolLookup.get(binding.sourceFile);
            const targetId = targetSymbols?.get(attrNode.text) ?? null;
            if (targetId) {
              relationships.push({
                sourceId: classSymbolId,
                targetId,
                kind: RelationshipKind.Inherits,
                filePath: file.filePath,
                lineNumber: child.startPosition.row + 1,
              });
            }
          }
        }
      }
    }
  });
}

function resolveAndEmitInheritance(
  baseName: string,
  classSymbolId: string,
  file: ParsedFile,
  importBindings: Map<string, ImportBinding>,
  symbolLookup: SymbolLookup,
  relationships: Relationship[],
  lineNumber: number,
): void {
  // Try imported binding first
  const binding = importBindings.get(baseName);
  if (binding?.symbolId && binding.originalName !== "*") {
    relationships.push({
      sourceId: classSymbolId,
      targetId: binding.symbolId,
      kind: RelationshipKind.Inherits,
      filePath: file.filePath,
      lineNumber,
    });
    return;
  }

  // Try local symbol lookup
  const localSymbols = symbolLookup.get(file.filePath);
  const localId = localSymbols?.get(baseName) ?? null;
  if (localId) {
    relationships.push({
      sourceId: classSymbolId,
      targetId: localId,
      kind: RelationshipKind.Inherits,
      filePath: file.filePath,
      lineNumber,
    });
  }
}

// ── Helpers ──

function walkTree(
  node: Parser.SyntaxNode,
  visitor: (n: Parser.SyntaxNode) => void,
): void {
  visitor(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    walkTree(node.namedChild(i)!, visitor);
  }
}

function generateFileSymbolId(filePath: string): string {
  return generateSymbolId(filePath, "<module>", SymbolKind.Module);
}

function getSource(file: ParsedFile, rootPath: string): string | null {
  try {
    const absPath = resolve(rootPath, file.filePath);
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}
