/**
 * TypeScript tree-sitter parser.
 *
 * Extracts symbols (functions, classes, interfaces, type aliases, enums)
 * and their metadata from TypeScript source files using tree-sitter.
 */

import Parser from "tree-sitter";
// @ts-expect-error — tree-sitter grammars lack type declarations
import TypeScriptLang from "tree-sitter-typescript/typescript";
// @ts-expect-error — tree-sitter grammars lack type declarations
import TSXLang from "tree-sitter-typescript/tsx";
import type { ParsedFile, Symbol } from "../types.js";
import { SymbolKind } from "../types.js";
import { generateSymbolId, nodeText } from "./common.js";

// ── Parser singletons ──

const tsParser = new Parser();
tsParser.setLanguage(TypeScriptLang);

const tsxParser = new Parser();
tsxParser.setLanguage(TSXLang);

// ── Public API ──

/**
 * Parse a TypeScript (or TSX) source file and extract all symbols.
 *
 * @param filePath - Repo-relative path to the file
 * @param source - Full source text of the file
 * @param isTSX - Whether to use the TSX grammar (default: auto-detect from extension)
 * @returns ParsedFile with extracted symbols and empty relationships
 */
export function parseTypeScript(
  filePath: string,
  source: string,
  isTSX?: boolean,
): ParsedFile {
  const useTSX = isTSX ?? filePath.endsWith(".tsx");
  const parser = useTSX ? tsxParser : tsParser;
  const tree = parser.parse(source);
  const root = tree.rootNode;

  const symbols: Symbol[] = [];

  for (let i = 0; i < root.namedChildCount; i++) {
    const node = root.namedChild(i)!;

    if (node.type === "export_statement") {
      // Exported declaration — unwrap and extract
      const decl = node.namedChildren[0];
      if (!decl) continue;
      const docstring = getDocstring(root, i);
      extractDeclaration(decl, filePath, true, docstring, symbols, source);
    } else if (isDeclarationNode(node.type)) {
      const docstring = getDocstring(root, i);
      extractDeclaration(node, filePath, false, docstring, symbols, source);
    }
    // Skip comment nodes and other non-declarations
  }

  return {
    filePath,
    language: "typescript",
    symbols,
    relationships: [],
  };
}

// ── Declaration extraction ──

const DECLARATION_TYPES = new Set([
  "function_declaration",
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "lexical_declaration", // const/let — may contain arrow functions
]);

function isDeclarationNode(type: string): boolean {
  return DECLARATION_TYPES.has(type);
}

function extractDeclaration(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  switch (node.type) {
    case "function_declaration":
      extractFunction(node, filePath, exported, docstring, symbols, fullSource);
      break;
    case "class_declaration":
    case "abstract_class_declaration":
      extractClass(node, filePath, exported, docstring, symbols, fullSource);
      break;
    case "interface_declaration":
      extractInterface(node, filePath, exported, docstring, symbols, fullSource);
      break;
    case "type_alias_declaration":
      extractTypeAlias(node, filePath, exported, docstring, symbols, fullSource);
      break;
    case "enum_declaration":
      extractEnum(node, filePath, exported, docstring, symbols, fullSource);
      break;
    case "lexical_declaration":
      extractLexicalDeclaration(
        node,
        filePath,
        exported,
        docstring,
        symbols,
        fullSource,
      );
      break;
  }
}

// ── Function ──

function extractFunction(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const name = nodeText(node.childForFieldName("name"));
  if (!name) return;

  const params = nodeText(node.childForFieldName("parameters"));
  const returnType = getReturnType(node);
  const asyncPrefix = hasChildToken(node, "async") ? "async " : "";
  const signature = `${asyncPrefix}function ${name}${params ?? "()"}${returnType}`;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.Function),
    name,
    kind: SymbolKind.Function,
    filePath,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(node, fullSource),
    exported,
  });
}

// ── Class ──

function extractClass(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const nameNode = node.childForFieldName("name");
  const name = nodeText(nameNode);
  if (!name) return;

  // Build signature with heritage
  const heritage = getClassHeritage(node);
  const isAbstract = node.type === "abstract_class_declaration";
  const signature = `${isAbstract ? "abstract " : ""}class ${name}${heritage}`;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.Class),
    name,
    kind: SymbolKind.Class,
    filePath,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(node, fullSource),
    exported,
  });

  // Extract methods from class body
  const body = node.namedChildren.find((c) => c.type === "class_body");
  if (body) {
    extractClassMembers(body, name, filePath, exported, symbols, fullSource);
  }
}

function extractClassMembers(
  body: Parser.SyntaxNode,
  className: string,
  filePath: string,
  classExported: boolean,
  symbols: Symbol[],
  fullSource: string,
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i)!;
    if (
      member.type === "method_definition" ||
      member.type === "abstract_method_signature"
    ) {
      extractMethod(
        member,
        className,
        filePath,
        classExported,
        getDocstring(body, i),
        symbols,
        fullSource,
      );
    }
  }
}

function extractMethod(
  node: Parser.SyntaxNode,
  className: string,
  filePath: string,
  classExported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const nameNode = node.childForFieldName("name");
  const name = nodeText(nameNode);
  if (!name) return;

  const params = nodeText(node.childForFieldName("parameters"));
  const returnType = getReturnType(node);

  // Detect modifiers: async, static, get, set
  const isAsync = hasChildToken(node, "async");
  const isStatic = hasChildToken(node, "static");
  const accessor = getAccessor(node);

  const parts: string[] = [];
  if (isStatic) parts.push("static");
  if (isAsync) parts.push("async");
  if (accessor) parts.push(accessor);
  parts.push(`${name}${params ?? "()"}${returnType}`);

  const qualifiedName = `${className}.${name}`;
  const signature = parts.join(" ");

  symbols.push({
    id: generateSymbolId(filePath, qualifiedName, SymbolKind.Method),
    name: qualifiedName,
    kind: SymbolKind.Method,
    filePath,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(node, fullSource),
    exported: classExported,
  });
}

// ── Interface ──

function extractInterface(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const name = nodeText(node.childForFieldName("name"));
  if (!name) return;

  const extendsClause = getExtendsClause(node);
  const signature = `interface ${name}${extendsClause}`;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.Interface),
    name,
    kind: SymbolKind.Interface,
    filePath,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(node, fullSource),
    exported,
  });
}

// ── Type alias ──

function extractTypeAlias(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const name = nodeText(node.childForFieldName("name"));
  if (!name) return;

  const valueNode = node.childForFieldName("value");
  const valueText = valueNode ? nodeText(valueNode) : null;
  const signature = `type ${name} = ${valueText ?? "unknown"}`;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.TypeAlias),
    name,
    kind: SymbolKind.TypeAlias,
    filePath,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(node, fullSource),
    exported,
  });
}

// ── Enum ──

function extractEnum(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const nameNode = node.childForFieldName("name");
  const name = nodeText(nameNode);
  if (!name) return;

  const signature = `enum ${name}`;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.Enum),
    name,
    kind: SymbolKind.Enum,
    filePath,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(node, fullSource),
    exported,
  });
}

// ── Lexical declarations (const/let arrow functions) ──

function extractLexicalDeclaration(
  node: Parser.SyntaxNode,
  filePath: string,
  exported: boolean,
  docstring: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  // Look for variable_declarator children with arrow_function values
  for (const declarator of node.namedChildren) {
    if (declarator.type !== "variable_declarator") continue;

    const nameNode = declarator.childForFieldName("name");
    const valueNode = declarator.childForFieldName("value");
    if (!nameNode || !valueNode) continue;

    const name = nodeText(nameNode);
    if (!name) continue;

    if (valueNode.type === "arrow_function") {
      const params = nodeText(valueNode.childForFieldName("parameters"));
      const returnType = getReturnType(valueNode);
      const asyncPrefix = hasChildToken(valueNode, "async") ? "async " : "";
      const signature = `const ${name} = ${asyncPrefix}${params ?? "()"}${returnType} => ...`;

      symbols.push({
        id: generateSymbolId(filePath, name, SymbolKind.Function),
        name,
        kind: SymbolKind.Function,
        filePath,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        signature,
        docstring,
        source: getSourceText(node, fullSource),
        exported,
      });
    } else if (valueNode.type === "function") {
      // `const foo = function(...) { ... }`
      const params = nodeText(valueNode.childForFieldName("parameters"));
      const returnType = getReturnType(valueNode);
      const asyncPrefix = hasChildToken(valueNode, "async") ? "async " : "";
      const signature = `const ${name} = ${asyncPrefix}function${params ?? "()"}${returnType}`;

      symbols.push({
        id: generateSymbolId(filePath, name, SymbolKind.Function),
        name,
        kind: SymbolKind.Function,
        filePath,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        signature,
        docstring,
        source: getSourceText(node, fullSource),
        exported,
      });
    }
    // Non-function const/let declarations are not symbols we track
  }
}

// ── Helpers ──

/**
 * Get the JSDoc docstring for a node, if one exists.
 * Looks at the previous named sibling — if it's a JSDoc comment, returns its text.
 */
function getDocstring(
  parent: Parser.SyntaxNode,
  childIndex: number,
): string | null {
  if (childIndex <= 0) return null;

  const prev = parent.namedChild(childIndex - 1);
  if (!prev || prev.type !== "comment") return null;

  const text = prev.text;
  // Only treat JSDoc-style comments (/** ... */) as docstrings
  if (text.startsWith("/**")) {
    return cleanDocstring(text);
  }
  return null;
}

/**
 * Clean a JSDoc comment: strip delimiters and leading asterisks.
 */
function cleanDocstring(raw: string): string {
  return raw
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .replace(/^\s*\* ?/gm, "")
    .trim();
}

/**
 * Get the return type annotation from a node, if present.
 * Returns the text including the leading ": " or empty string.
 */
function getReturnType(node: Parser.SyntaxNode): string {
  const typeAnnotation = node.namedChildren.find(
    (c) => c.type === "type_annotation",
  );
  return typeAnnotation ? typeAnnotation.text : "";
}

/**
 * Check if a node has an unnamed child token with a specific text.
 * Used to detect keywords like `async`, `static`, `get`, `set`.
 */
function hasChildToken(node: Parser.SyntaxNode, token: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (!child.isNamed && child.text === token) return true;
  }
  return false;
}

/**
 * Get the accessor keyword (get/set) for a method, if present.
 */
function getAccessor(node: Parser.SyntaxNode): string | null {
  if (hasChildToken(node, "get")) return "get";
  if (hasChildToken(node, "set")) return "set";
  return null;
}

/**
 * Get extends/implements heritage for a class declaration.
 */
function getClassHeritage(node: Parser.SyntaxNode): string {
  const parts: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "class_heritage") {
      parts.push(` ${child.text}`);
    }
  }
  return parts.join("");
}

/**
 * Get extends clause for an interface declaration.
 */
function getExtendsClause(node: Parser.SyntaxNode): string {
  for (const child of node.namedChildren) {
    if (child.type === "extends_type_clause") {
      return ` ${child.text}`;
    }
  }
  return "";
}

/**
 * Extract source text for a symbol node.
 * Uses the original source string with byte offsets for accuracy.
 */
function getSourceText(
  node: Parser.SyntaxNode,
  fullSource: string,
): string {
  return fullSource.slice(node.startIndex, node.endIndex);
}
