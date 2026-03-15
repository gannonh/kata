import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePython } from "../../src/parser/python.js";
import { SymbolKind } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "python");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

function findSymbol(filePath: string, source: string, name: string) {
  const result = parsePython(filePath, source);
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
  const source = loadFixture("simple-function.py");

  it("extracts a function with type annotations", () => {
    const result = parsePython("simple-function.py", source);
    expect(result.symbols).toHaveLength(1);

    const sym = result.symbols[0];
    expect(sym.name).toBe("greet");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.signature).toBe("def greet(name: str) -> str");
    expect(sym.docstring).toBe("Greets a user by name.");
    expect(sym.filePath).toBe("simple-function.py");
  });

  it("generates a stable deterministic ID", () => {
    const result1 = parsePython("simple-function.py", source);
    const result2 = parsePython("simple-function.py", source);
    expect(result1.symbols[0].id).toBe(result2.symbols[0].id);
    expect(result1.symbols[0].id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns language as python", () => {
    const result = parsePython("simple-function.py", source);
    expect(result.language).toBe("python");
  });

  it("returns empty relationships", () => {
    const result = parsePython("simple-function.py", source);
    expect(result.relationships).toEqual([]);
  });
});

// ── Async functions ──

describe("async functions", () => {
  const source = loadFixture("async-function.py");

  it("extracts async functions", () => {
    const result = parsePython("async-function.py", source);
    expect(result.symbols).toHaveLength(2);
  });

  it("includes async in signature", () => {
    const sym = findSymbol("async-function.py", source, "fetch_data");
    expect(sym.signature).toBe("async def fetch_data(url: str) -> dict");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.docstring).toBe("Fetches data from a URL.");
  });

  it("extracts async function without docstring", () => {
    const sym = findSymbol("async-function.py", source, "process_items");
    expect(sym.signature).toBe(
      "async def process_items(items: list) -> list",
    );
    expect(sym.docstring).toBeNull();
  });
});

// ── Decorated functions ──

describe("decorated functions", () => {
  const source = loadFixture("decorated-function.py");

  it("extracts the decorator as a regular function", () => {
    const sym = findSymbol("decorated-function.py", source, "my_decorator");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.docstring).toBe("A simple decorator.");
  });

  it("extracts decorated function with correct metadata", () => {
    const sym = findSymbol("decorated-function.py", source, "decorated_func");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.signature).toBe("def decorated_func(x: int) -> int");
    expect(sym.docstring).toBe("A decorated function.");
  });

  it("extracts all functions including decorated ones", () => {
    const result = parsePython("decorated-function.py", source);
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain("my_decorator");
    expect(names).toContain("decorated_func");
    expect(names).toContain("another_decorated");
  });

  it("includes decorator lines in source range", () => {
    const sym = findSymbol("decorated-function.py", source, "decorated_func");
    // The source should start from @my_decorator line
    expect(sym.source).toContain("@my_decorator");
  });
});

// ── Class with methods ──

describe("class with methods", () => {
  const source = loadFixture("class-with-methods.py");

  it("extracts the class", () => {
    const sym = findSymbol("class-with-methods.py", source, "Animal");
    expect(sym.kind).toBe(SymbolKind.Class);
    expect(sym.signature).toBe("class Animal");
    expect(sym.docstring).toBe("Base animal class.");
  });

  it("extracts __init__ method", () => {
    const sym = findSymbol(
      "class-with-methods.py",
      source,
      "Animal.__init__",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toBe(
      "def __init__(self, name: str, species: str)",
    );
    expect(sym.docstring).toBe("Initialize the animal.");
  });

  it("extracts regular method", () => {
    const sym = findSymbol("class-with-methods.py", source, "Animal.speak");
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toBe("def speak(self) -> str");
    expect(sym.docstring).toBe("Make the animal speak.");
  });

  it("extracts async method", () => {
    const sym = findSymbol(
      "class-with-methods.py",
      source,
      "Animal.fetch_info",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toBe("async def fetch_info(self) -> dict");
    expect(sym.docstring).toBe("Fetch animal info asynchronously.");
  });

  it("detects @staticmethod", () => {
    const sym = findSymbol("class-with-methods.py", source, "Animal.create");
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toContain("@staticmethod");
    expect(sym.signature).toContain("def create(kind: str)");
    expect(sym.docstring).toBe("Factory method.");
  });

  it("detects @classmethod", () => {
    const sym = findSymbol(
      "class-with-methods.py",
      source,
      "Animal.from_dict",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toContain("@classmethod");
    expect(sym.signature).toContain("def from_dict(cls, data: dict)");
    expect(sym.docstring).toBe("Create from dictionary.");
  });

  it("detects @property", () => {
    const sym = findSymbol(
      "class-with-methods.py",
      source,
      "Animal.display_name",
    );
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toContain("@property");
    expect(sym.signature).toContain("def display_name(self) -> str");
    expect(sym.docstring).toBe("Get the display name.");
  });

  it("extracts all class members", () => {
    const result = parsePython("class-with-methods.py", source);
    const names = result.symbols.map((s) => s.name);
    expect(names).toEqual([
      "Animal",
      "Animal.__init__",
      "Animal.speak",
      "Animal.fetch_info",
      "Animal.create",
      "Animal.from_dict",
      "Animal.display_name",
    ]);
  });
});

// ── Inheritance ──

describe("inheritance", () => {
  const source = loadFixture("inheritance.py");

  it("extracts class with no bases", () => {
    const sym = findSymbol("inheritance.py", source, "Base");
    expect(sym.signature).toBe("class Base");
  });

  it("extracts class with single base", () => {
    const sym = findSymbol("inheritance.py", source, "Child");
    expect(sym.signature).toBe("class Child(Base)");
    expect(sym.docstring).toBe("Single inheritance.");
  });

  it("extracts class with multiple bases", () => {
    const sym = findSymbol("inheritance.py", source, "Multi");
    expect(sym.signature).toBe("class Multi(Child, Base)");
    expect(sym.docstring).toBe("Multiple inheritance.");
  });
});

// ── Mixed declarations ──

describe("mixed declarations", () => {
  const source = loadFixture("mixed-declarations.py");

  it("extracts functions and classes but not variables", () => {
    const result = parsePython("mixed-declarations.py", source);
    const names = result.symbols.map((s) => s.name);
    // VERSION = "1.0.0" should NOT be extracted
    expect(names).not.toContain("VERSION");
    // Functions and classes should be extracted
    expect(names).toContain("helper");
    expect(names).toContain("Config");
    expect(names).toContain("main");
  });

  it("extracts async function in mixed file", () => {
    const sym = findSymbol("mixed-declarations.py", source, "main");
    expect(sym.kind).toBe(SymbolKind.Function);
    expect(sym.signature).toBe("async def main() -> None");
    expect(sym.docstring).toBe("Entry point.");
  });

  it("extracts class with @property in mixed file", () => {
    const sym = findSymbol("mixed-declarations.py", source, "Config.is_debug");
    expect(sym.kind).toBe(SymbolKind.Method);
    expect(sym.signature).toContain("@property");
  });
});

// ── Edge cases ──

describe("edge cases", () => {
  it("returns empty symbols for empty file", () => {
    const result = parsePython("empty.py", "");
    expect(result.symbols).toEqual([]);
    expect(result.language).toBe("python");
  });

  it("returns empty symbols for file with only comments", () => {
    const result = parsePython("comments.py", "# Just a comment\n# Another");
    expect(result.symbols).toEqual([]);
  });

  it("returns empty symbols for file with only assignments", () => {
    const result = parsePython(
      "vars.py",
      'X = 1\nY = "hello"\nZ = [1, 2, 3]',
    );
    expect(result.symbols).toEqual([]);
  });

  it("handles function with no type annotations", () => {
    const result = parsePython("no-types.py", "def foo(x, y):\n    return x + y");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].signature).toBe("def foo(x, y)");
    expect(result.symbols[0].docstring).toBeNull();
  });

  it("handles function with no parameters", () => {
    const result = parsePython("no-params.py", "def noop():\n    pass");
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].signature).toBe("def noop()");
  });
});
