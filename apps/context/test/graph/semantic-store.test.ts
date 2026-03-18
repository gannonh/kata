import { GraphStore } from "../../src/graph/store.js";
import { generateSymbolId } from "../../src/parser/common.js";
import { SymbolKind } from "../../src/types.js";
import type { Symbol } from "../../src/types.js";

function makeSymbol(name: string, filePath: string): Symbol {
  return {
    id: generateSymbolId(filePath, name, SymbolKind.Function),
    name,
    kind: SymbolKind.Function,
    filePath,
    lineStart: 1,
    lineEnd: 20,
    signature: `function ${name}(): void`,
    docstring: null,
    source: `export function ${name}() { return; }`,
    exported: true,
  };
}

function requireMethod<T extends object>(obj: T, method: string): (...args: any[]) => any {
  const candidate = (obj as any)[method];
  expect(typeof candidate).toBe(
    "function",
  );
  return candidate as (...args: any[]) => any;
}

describe("semantic store contract (T01 red-first)", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("exposes semantic vector lifecycle APIs on GraphStore", () => {
    expect(typeof (store as any).upsertSemanticVectors).toBe("function");
    expect(typeof (store as any).querySemanticNearest).toBe("function");
    expect(typeof (store as any).deleteSemanticVectorsByFile).toBe("function");
    expect(typeof (store as any).getSemanticStatus).toBe("function");
    expect(typeof (store as any).setSemanticStatus).toBe("function");
  });

  it("enforces add/modify/delete/rename vector parity with deterministic symbol IDs", () => {
    const authSymbol = makeSymbol("parseAuthHeader", "src/auth.ts");
    const routerSymbol = makeSymbol("routeProjectRequest", "src/router.ts");
    store.upsertSymbols([authSymbol, routerSymbol]);

    const upsertVectors = requireMethod(store, "upsertSemanticVectors");
    const queryNearest = requireMethod(store, "querySemanticNearest");
    const deleteByFile = requireMethod(store, "deleteSemanticVectorsByFile");
    const countVectors = requireMethod(store, "countSemanticVectors");

    upsertVectors([
      {
        symbolId: authSymbol.id,
        filePath: authSymbol.filePath,
        model: "text-embedding-3-small",
        dimensions: 4,
        vector: [0.1, 0.2, 0.3, 0.4],
      },
      {
        symbolId: routerSymbol.id,
        filePath: routerSymbol.filePath,
        model: "text-embedding-3-small",
        dimensions: 4,
        vector: [0.4, 0.3, 0.2, 0.1],
      },
    ]);

    expect(countVectors()).toBe(2);

    const nearest = queryNearest({
      queryVector: [0.1, 0.2, 0.3, 0.4],
      topK: 1,
      model: "text-embedding-3-small",
    });
    expect(nearest).toHaveLength(1);
    expect(nearest[0].symbolId).toBe(authSymbol.id);

    // Simulate rename parity: old file vectors removed before new symbol/vector is inserted.
    deleteByFile("src/auth.ts");
    expect(countVectors()).toBe(1);

    const renamedSymbol = makeSymbol("parseAuthHeader", "src/security/auth.ts");
    store.upsertSymbols([renamedSymbol]);
    upsertVectors([
      {
        symbolId: renamedSymbol.id,
        filePath: renamedSymbol.filePath,
        model: "text-embedding-3-small",
        dimensions: 4,
        vector: [0.11, 0.21, 0.31, 0.41],
      },
    ]);

    expect(countVectors()).toBe(2);
  });

  it("guards against model/dimension drift when writing vectors", () => {
    const symbol = makeSymbol("canAccessProject", "src/auth.ts");
    store.upsertSymbols([symbol]);

    const upsertVectors = requireMethod(store, "upsertSemanticVectors");

    upsertVectors([
      {
        symbolId: symbol.id,
        filePath: symbol.filePath,
        model: "text-embedding-3-small",
        dimensions: 4,
        vector: [0.1, 0.2, 0.3, 0.4],
      },
    ]);

    expect(() =>
      upsertVectors([
        {
          symbolId: symbol.id,
          filePath: symbol.filePath,
          model: "text-embedding-3-large",
          dimensions: 8,
          vector: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        },
      ]),
    ).toThrow(/model|dimension|semantic/i);
  });

  it("persists semantic failure diagnostics for post-run inspection", () => {
    const setSemanticStatus = requireMethod(store, "setSemanticStatus");
    const getSemanticStatus = requireMethod(store, "getSemanticStatus");

    const timestamp = new Date().toISOString();

    setSemanticStatus({
      status: "failed",
      phase: "embedding",
      provider: "openai",
      errorCode: "SEMANTIC_OPENAI_MISSING_KEY",
      message: "OPENAI_API_KEY is not set",
      timestamp,
      retryable: false,
    });

    const status = getSemanticStatus();

    expect(status).toMatchObject({
      status: "failed",
      phase: "embedding",
      provider: "openai",
      errorCode: "SEMANTIC_OPENAI_MISSING_KEY",
      retryable: false,
    });
    expect(typeof status.timestamp).toBe("string");
  });
});
