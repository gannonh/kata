/**
 * Python tree-sitter parser.
 *
 * Extracts symbols (functions, classes, methods) and their metadata
 * from Python source files using tree-sitter.
 */

import Parser from "tree-sitter";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PythonLang = require("tree-sitter-python") as Parser.Language;
import type { ParsedFile, Symbol } from "../types.js";
import { SymbolKind } from "../types.js";
import { generateSymbolId, nodeText } from "./common.js";

// ── Parser singleton ──

const pyParser = new Parser();
pyParser.setLanguage(PythonLang);

// ── Public API ──

/**
 * Parse a Python source file and extract all symbols.
 *
 * @param filePath - Repo-relative path to the file
 * @param source - Full source text of the file
 * @returns ParsedFile with extracted symbols and empty relationships
 */
export function parsePython(filePath: string, source: string): ParsedFile {
  const tree = pyParser.parse(source);
  const root = tree.rootNode;

  const symbols: Symbol[] = [];

  for (let i = 0; i < root.namedChildCount; i++) {
    const node = root.namedChild(i)!;

    switch (node.type) {
      case "function_definition":
        extractFunction(node, filePath, null, symbols, source);
        break;
      case "class_definition":
        extractClass(node, filePath, symbols, source);
        break;
      case "decorated_definition":
        extractDecorated(node, filePath, null, symbols, source);
        break;
    }
  }

  return {
    filePath,
    language: "python",
    symbols,
    relationships: [],
  };
}

// ── Decorated definition ──

function extractDecorated(
  node: Parser.SyntaxNode,
  filePath: string,
  className: string | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const decorators = getDecorators(node);
  const inner = getDecoratedInner(node);
  if (!inner) return;

  if (inner.type === "function_definition") {
    if (className) {
      extractMethod(inner, className, filePath, decorators, symbols, fullSource);
    } else {
      extractFunction(inner, filePath, decorators, symbols, fullSource);
    }
  } else if (inner.type === "class_definition") {
    extractClass(inner, filePath, symbols, fullSource, decorators);
  }
}

// ── Function ──

function extractFunction(
  node: Parser.SyntaxNode,
  filePath: string,
  decorators: string[] | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const name = nodeText(node.childForFieldName("name"));
  if (!name) return;

  const isAsync = hasChildToken(node, "async");
  const signature = buildFunctionSignature(node, name, isAsync);
  const docstring = getDocstring(node);

  // Use the decorated_definition parent for source range if decorators present
  const sourceNode = decorators ? (node.parent ?? node) : node;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.Function),
    name,
    kind: SymbolKind.Function,
    filePath,
    lineStart: sourceNode.startPosition.row + 1,
    lineEnd: sourceNode.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(sourceNode, fullSource),
    exported: true, // Python has no export concept — everything is accessible
  });
}

// ── Class ──

function extractClass(
  node: Parser.SyntaxNode,
  filePath: string,
  symbols: Symbol[],
  fullSource: string,
  decorators?: string[],
): void {
  const name = nodeText(node.childForFieldName("name"));
  if (!name) return;

  const bases = getClassBases(node);
  const signature = bases ? `class ${name}(${bases})` : `class ${name}`;
  const docstring = getDocstring(node);

  // Use the decorated_definition parent for source range if decorators present
  const sourceNode = decorators ? (node.parent ?? node) : node;

  symbols.push({
    id: generateSymbolId(filePath, name, SymbolKind.Class),
    name,
    kind: SymbolKind.Class,
    filePath,
    lineStart: sourceNode.startPosition.row + 1,
    lineEnd: sourceNode.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(sourceNode, fullSource),
    exported: true,
  });

  // Extract methods from class body
  const body = node.childForFieldName("body");
  if (body) {
    extractClassMembers(body, name, filePath, symbols, fullSource);
  }
}

function extractClassMembers(
  body: Parser.SyntaxNode,
  className: string,
  filePath: string,
  symbols: Symbol[],
  fullSource: string,
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i)!;

    if (member.type === "function_definition") {
      extractMethod(member, className, filePath, null, symbols, fullSource);
    } else if (member.type === "decorated_definition") {
      extractDecorated(member, filePath, className, symbols, fullSource);
    }
  }
}

// ── Method ──

function extractMethod(
  node: Parser.SyntaxNode,
  className: string,
  filePath: string,
  decorators: string[] | null,
  symbols: Symbol[],
  fullSource: string,
): void {
  const name = nodeText(node.childForFieldName("name"));
  if (!name) return;

  const isAsync = hasChildToken(node, "async");
  const isStaticmethod = decorators?.includes("staticmethod") ?? false;
  const isClassmethod = decorators?.includes("classmethod") ?? false;
  const isProperty = decorators?.includes("property") ?? false;

  const signature = buildMethodSignature(
    node,
    name,
    isAsync,
    isStaticmethod,
    isClassmethod,
    isProperty,
  );
  const docstring = getDocstring(node);
  const qualifiedName = `${className}.${name}`;

  // Use the decorated_definition parent for source range if decorators present
  const sourceNode = decorators ? (node.parent ?? node) : node;

  symbols.push({
    id: generateSymbolId(filePath, qualifiedName, SymbolKind.Method),
    name: qualifiedName,
    kind: SymbolKind.Method,
    filePath,
    lineStart: sourceNode.startPosition.row + 1,
    lineEnd: sourceNode.endPosition.row + 1,
    signature,
    docstring,
    source: getSourceText(sourceNode, fullSource),
    exported: true,
  });
}

// ── Signature builders ──

function buildFunctionSignature(
  node: Parser.SyntaxNode,
  name: string,
  isAsync: boolean,
): string {
  const params = nodeText(node.childForFieldName("parameters")) ?? "()";
  const returnType = getReturnAnnotation(node);
  const prefix = isAsync ? "async " : "";
  return `${prefix}def ${name}${params}${returnType}`;
}

function buildMethodSignature(
  node: Parser.SyntaxNode,
  name: string,
  isAsync: boolean,
  isStaticmethod: boolean,
  isClassmethod: boolean,
  isProperty: boolean,
): string {
  const params = nodeText(node.childForFieldName("parameters")) ?? "()";
  const returnType = getReturnAnnotation(node);

  const parts: string[] = [];
  if (isStaticmethod) parts.push("@staticmethod");
  if (isClassmethod) parts.push("@classmethod");
  if (isProperty) parts.push("@property");
  if (isAsync) parts.push("async");
  parts.push(`def ${name}${params}${returnType}`);

  return parts.join(" ");
}

// ── Helpers ──

/**
 * Get the return type annotation from a function node (Python `-> type`).
 * Returns the text including ` -> type` or empty string.
 */
function getReturnAnnotation(node: Parser.SyntaxNode): string {
  const retType = node.childForFieldName("return_type");
  if (!retType) return "";
  return ` -> ${retType.text}`;
}

/**
 * Extract the Python docstring from a function or class definition.
 * Python convention: first statement in the body that is a string literal.
 */
function getDocstring(node: Parser.SyntaxNode): string | null {
  const body = node.childForFieldName("body");
  if (!body || body.namedChildCount === 0) return null;

  const firstStmt = body.namedChild(0)!;
  if (firstStmt.type !== "expression_statement") return null;

  const expr = firstStmt.namedChild(0);
  if (!expr || expr.type !== "string") return null;

  return cleanDocstring(expr.text);
}

/**
 * Clean a Python docstring: strip triple-quote delimiters and normalize whitespace.
 */
function cleanDocstring(raw: string): string {
  // Remove triple-quote delimiters (both """ and ''')
  let text = raw;
  // Handle string prefixes like r, f, b, u and combinations
  const prefixMatch = text.match(/^[rRfFbBuU]{0,2}/);
  if (prefixMatch && prefixMatch[0]) {
    text = text.slice(prefixMatch[0].length);
  }
  if (text.startsWith('"""') && text.endsWith('"""')) {
    text = text.slice(3, -3);
  } else if (text.startsWith("'''") && text.endsWith("'''")) {
    text = text.slice(3, -3);
  } else if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  return text.trim();
}

/**
 * Get decorator names from a decorated_definition node.
 */
function getDecorators(node: Parser.SyntaxNode): string[] {
  const decorators: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "decorator") {
      // Decorator name is the identifier or dotted_name inside the decorator
      const nameNode =
        child.namedChildren.find((c) => c.type === "identifier") ??
        child.namedChildren.find((c) => c.type === "dotted_name") ??
        child.namedChildren.find((c) => c.type === "call");
      if (nameNode) {
        // For call-style decorators like @decorator(args), extract just the function name
        if (nameNode.type === "call") {
          const funcNode = nameNode.childForFieldName("function");
          decorators.push(funcNode ? funcNode.text : nameNode.text);
        } else {
          decorators.push(nameNode.text);
        }
      }
    }
  }
  return decorators;
}

/**
 * Get the inner definition from a decorated_definition node.
 */
function getDecoratedInner(
  node: Parser.SyntaxNode,
): Parser.SyntaxNode | null {
  for (const child of node.namedChildren) {
    if (
      child.type === "function_definition" ||
      child.type === "class_definition"
    ) {
      return child;
    }
  }
  return null;
}

/**
 * Get base classes from a class_definition node.
 * Returns comma-separated base names or null.
 */
function getClassBases(node: Parser.SyntaxNode): string | null {
  const argList = node.namedChildren.find((c) => c.type === "argument_list");
  if (!argList) return null;
  // Extract the text without the enclosing parens
  const text = argList.text;
  if (text.startsWith("(") && text.endsWith(")")) {
    const inner = text.slice(1, -1).trim();
    return inner || null;
  }
  return text || null;
}

/**
 * Check if a node has an unnamed child token with a specific text.
 */
function hasChildToken(node: Parser.SyntaxNode, token: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (!child.isNamed && child.text === token) return true;
  }
  return false;
}

/**
 * Extract source text for a symbol node.
 */
function getSourceText(
  node: Parser.SyntaxNode,
  fullSource: string,
): string {
  return fullSource.slice(node.startIndex, node.endIndex);
}
