import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTypeScript } from "../../src/parser/typescript.js";
import { SymbolKind } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "typescript");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

function findSymbol(filePath: string, source: string, name: string) {
  const result = parseTypeScript(filePath, source);
  const sym = result.symbols.find((s) => s.name === name);
  if (!sym) {
    const names = result.symbols.map((s) => s.name);
    throw new Error(
      `Symbol "${name}" not found. Available: ${names.join(", ")}`,
    );
  }
  return sym;
}

// ── Simple function ──

describe("simple function", () => {
  const source = loadFixture("simple-function.ts");

  it("extracts a non-exported function", () => {
    const result = parseTypeScript("simple-function.ts", source);
    expect(result.symbols).toHaveLength(1);

    const sym = result.symbols[0];
    expect(sym.name).toBe("greet");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(false);
    expect(sym.signature).toBe("function greet(name: string): string");
    expect(sym.docstring).toBe("Greets a user by name");
    expect(sym.lineStart).toBe(2);
    expect(sym.lineEnd).toBe(4);
    expect(sym.filePath).toBe("simple-function.ts");
  });

  it("generates a stable deterministic ID", () => {
    const result1 = parseTypeScript("simple-function.ts", source);
    const result2 = parseTypeScript("simple-function.ts", source);
    expect(result1.symbols[0].id).toBe(result2.symbols[0].id);
    expect(result1.symbols[0].id).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ── Exported functions ──

describe("exported functions", () => {
  const source = loadFixture("exported-function.ts");

  it("extracts an exported function with multi-line JSDoc", () => {
    const sym = findSymbol("exported-function.ts", source, "add");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe("function add(a: number, b: number): number");
    expect(sym.docstring).toContain("Adds two numbers together");
    expect(sym.docstring).toContain("@param a");
  });

  it("extracts an async exported function", () => {
    const sym = findSymbol("exported-function.ts", source, "fetchData");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe(
      "async function fetchData(url: string): Promise<string>",
    );
    // fetchData has no JSDoc
    expect(sym.docstring).toBe(null);
  });
});

// ── Class with methods ──

describe("class with methods", () => {
  const source = loadFixture("class-with-methods.ts");

  it("extracts the class itself", () => {
    const sym = findSymbol("class-with-methods.ts", source, "UserService");
    expect(sym.kind).toBe(SymbolKind.Class);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe("class UserService");
    expect(sym.docstring).toBe("Service for managing users");
  });

  it("extracts an async method with JSDoc", () => {
    const sym = findSymbol(
      "class-with-methods.ts",
      source,
      "UserService.findById",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toBe(
      "async findById(id: string): Promise<User | null>",
    );
    expect(sym.docstring).toBe("Find a user by their ID");
  });

  it("extracts a static method", () => {
    const sym = findSymbol(
      "class-with-methods.ts",
      source,
      "UserService.create",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toBe(
      "static create(db: Database): UserService",
    );
  });

  it("extracts a getter method", () => {
    const sym = findSymbol(
      "class-with-methods.ts",
      source,
      "UserService.count",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toBe("get count(): number");
  });

  it("extracts constructor as a method with qualified name", () => {
    const result = parseTypeScript("class-with-methods.ts", source);
    const constructorSym = result.symbols.find((s) =>
      s.name.includes("constructor"),
    );
    // constructor should still be extracted as a method
    expect(constructorSym).toBeDefined();
    expect(constructorSym!.kind).toBe(SymbolKind.Method);
  });

  it("extracts non-exported interfaces", () => {
    const result = parseTypeScript("class-with-methods.ts", source);
    const db = result.symbols.find((s) => s.name === "Database");
    const user = result.symbols.find((s) => s.name === "User");
    expect(db).toBeDefined();
    expect(db!.kind).toBe(SymbolKind.Interface);
    expect(db!.exported).toBe(false);
    expect(user).toBeDefined();
    expect(user!.kind).toBe(SymbolKind.Interface);
  });
});

// ── Interfaces and type aliases ──

describe("interfaces and type aliases", () => {
  const source = loadFixture("interfaces-and-types.ts");

  it("extracts an interface with its docstring", () => {
    const sym = findSymbol("interfaces-and-types.ts", source, "AppConfig");
    expect(sym.kind).toBe(SymbolKind.Interface);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe("interface AppConfig");
    expect(sym.docstring).toBe("Configuration for the application");
  });

  it("extracts an interface that extends another", () => {
    const sym = findSymbol(
      "interfaces-and-types.ts",
      source,
      "DatabaseConfig",
    );
    expect(sym.kind).toBe(SymbolKind.Interface);
    expect(sym.signature).toBe("interface DatabaseConfig extends AppConfig");
  });

  it("extracts a simple type alias", () => {
    const sym = findSymbol("interfaces-and-types.ts", source, "UserId");
    expect(sym.kind).toBe(SymbolKind.TypeAlias);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe("type UserId = string");
  });

  it("extracts a union type alias", () => {
    const sym = findSymbol("interfaces-and-types.ts", source, "Status");
    expect(sym.kind).toBe(SymbolKind.TypeAlias);
    expect(sym.signature).toContain("type Status =");
  });

  it("extracts a generic type alias", () => {
    const sym = findSymbol("interfaces-and-types.ts", source, "Result");
    expect(sym.kind).toBe(SymbolKind.TypeAlias);
    expect(sym.signature).toContain("type Result");
  });

  it("extracts all symbols from the file", () => {
    const result = parseTypeScript("interfaces-and-types.ts", source);
    expect(result.symbols).toHaveLength(5);
  });
});

// ── Enums ──

describe("enums", () => {
  const source = loadFixture("enum.ts");

  it("extracts an exported enum with docstring", () => {
    const sym = findSymbol("enum.ts", source, "HttpStatus");
    expect(sym.kind).toBe(SymbolKind.Enum);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe("enum HttpStatus");
    expect(sym.docstring).toBe("HTTP status codes");
  });

  it("extracts a non-exported enum", () => {
    const sym = findSymbol("enum.ts", source, "LogLevel");
    expect(sym.kind).toBe(SymbolKind.Enum);
    expect(sym.exported).toBe(false);
    expect(sym.signature).toBe("enum LogLevel");
  });
});

// ── Arrow functions ──

describe("arrow functions", () => {
  const source = loadFixture("arrow-functions.ts");

  it("extracts an exported arrow function", () => {
    const sym = findSymbol("arrow-functions.ts", source, "multiply");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe(
      "const multiply = (a: number, b: number): number => ...",
    );
    expect(sym.docstring).toBe("Multiplies two numbers");
  });

  it("extracts an async arrow function", () => {
    const sym = findSymbol("arrow-functions.ts", source, "greetAsync");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(true);
    expect(sym.signature).toBe(
      "const greetAsync = async (name: string): Promise<string> => ...",
    );
  });

  it("extracts a non-exported arrow function", () => {
    const sym = findSymbol("arrow-functions.ts", source, "internalHelper");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(false);
  });

  it("extracts all arrow functions", () => {
    const result = parseTypeScript("arrow-functions.ts", source);
    expect(result.symbols).toHaveLength(4);
  });
});

// ── Mixed declarations ──

describe("mixed declarations", () => {
  const source = loadFixture("mixed-declarations.ts");

  it("extracts all expected symbol types", () => {
    const result = parseTypeScript("mixed-declarations.ts", source);
    const kinds = new Set(result.symbols.map((s) => s.kind));
    expect(kinds).toContain(SymbolKind.Function);
    expect(kinds).toContain(SymbolKind.Enum);
    expect(kinds).toContain(SymbolKind.Interface);
    expect(kinds).toContain(SymbolKind.TypeAlias);
    expect(kinds).toContain(SymbolKind.Class);
    expect(kinds).toContain(SymbolKind.Method);
  });

  it("does not extract non-function const as symbol", () => {
    const result = parseTypeScript("mixed-declarations.ts", source);
    const version = result.symbols.find((s) => s.name === "VERSION");
    expect(version).toBeUndefined();
    const timeout = result.symbols.find((s) => s.name === "DEFAULT_TIMEOUT");
    expect(timeout).toBeUndefined();
  });

  it("extracts arrow function const", () => {
    const sym = findSymbol("mixed-declarations.ts", source, "createHandler");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.exported).toBe(true);
    expect(sym.docstring).toBe("Process handler as arrow");
  });

  it("extracts class methods with correct qualified names", () => {
    const result = parseTypeScript("mixed-declarations.ts", source);
    const methods = result.symbols.filter((s) => s.kind === SymbolKind.Method);
    const methodNames = methods.map((m) => m.name).sort();
    expect(methodNames).toEqual(["EventBus.emit", "EventBus.on"]);
  });
});

// ── ParsedFile structure ──

describe("ParsedFile structure", () => {
  it("sets language to typescript", () => {
    const result = parseTypeScript("test.ts", "function foo() {}");
    expect(result.language).toBe("typescript");
  });

  it("preserves filePath", () => {
    const result = parseTypeScript("src/utils.ts", "function foo() {}");
    expect(result.filePath).toBe("src/utils.ts");
  });

  it("returns empty relationships array", () => {
    const result = parseTypeScript("test.ts", "function foo() {}");
    expect(result.relationships).toEqual([]);
  });

  it("handles empty source", () => {
    const result = parseTypeScript("empty.ts", "");
    expect(result.symbols).toEqual([]);
  });

  it("handles source with only comments", () => {
    const result = parseTypeScript("comments.ts", "// just a comment\n/* block */");
    expect(result.symbols).toEqual([]);
  });
});

// ── Source text ──

describe("source text extraction", () => {
  it("captures full source text of a function", () => {
    const source = `function add(a: number, b: number): number {\n  return a + b;\n}`;
    const sym = findSymbol("test.ts", source, "add");
    expect(sym.source).toBe(source);
  });

  it("captures source text of an interface", () => {
    const source = `interface Foo {\n  bar: string;\n}`;
    const sym = findSymbol("test.ts", source, "Foo");
    expect(sym.source).toBe(source);
  });
});

// ── Edge cases ──

describe("edge cases", () => {
  it("handles function with no return type", () => {
    const result = parseTypeScript("test.ts", "function foo(x: number) { return x; }");
    expect(result.symbols[0].signature).toBe("function foo(x: number)");
  });

  it("handles generic function", () => {
    const source = "export function identity<T>(value: T): T { return value; }";
    const result = parseTypeScript("test.ts", source);
    const sym = result.symbols[0];
    expect(sym.name).toBe("identity");
    expect(sym.exported).toBe(true);
  });

  it("handles abstract class", () => {
    const source = `export abstract class Base {\n  abstract doStuff(): void;\n}`;
    const result = parseTypeScript("test.ts", source);
    // Abstract class should still be extracted
    const classSym = result.symbols.find((s) => s.name === "Base");
    expect(classSym).toBeDefined();
    expect(classSym!.kind).toBe(SymbolKind.Class);
  });
});
