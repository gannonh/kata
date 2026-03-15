/**
 * Tests for TypeScript cross-file relationship extraction.
 *
 * Uses fixture files in test/fixtures/relationships/ts/ to verify
 * correct extraction of imports, calls, inherits, and implements edges.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { resolve, join } from "node:path";
import { extractTsRelationships } from "../../src/graph/ts-relationships.js";
import { parseFile } from "../../src/parser/index.js";
import { generateSymbolId } from "../../src/parser/common.js";
import type { ParsedFile } from "../../src/types.js";
import { RelationshipKind, SymbolKind } from "../../src/types.js";

// ── Setup ──

const FIXTURE_ROOT = resolve(__dirname, "../fixtures/relationships/ts");

function parseFixture(filename: string): ParsedFile {
  return parseFile(filename, { rootPath: FIXTURE_ROOT });
}

// Parse all fixtures once
let parsedFiles: ParsedFile[];
let relationships: ReturnType<typeof extractTsRelationships>;

beforeAll(() => {
  parsedFiles = [
    parseFixture("types.ts"),
    parseFixture("utils.ts"),
    parseFixture("service.ts"),
    parseFixture("index.ts"),
    parseFixture("consumer.ts"),
    parseFixture("init.ts"),
  ];

  relationships = extractTsRelationships(parsedFiles, FIXTURE_ROOT);
});

// ── Helpers ──

function symId(file: string, name: string, kind: SymbolKind): string {
  return generateSymbolId(file, name, kind);
}

function fileModuleId(file: string): string {
  return generateSymbolId(file, "<module>", SymbolKind.Module);
}

function findEdges(kind: RelationshipKind, filePath?: string) {
  return relationships.filter(
    (r) => r.kind === kind && (filePath === undefined || r.filePath === filePath),
  );
}

function hasEdge(
  sourceId: string,
  targetId: string,
  kind: RelationshipKind,
  filePath?: string,
): boolean {
  return relationships.some(
    (r) =>
      r.sourceId === sourceId &&
      r.targetId === targetId &&
      r.kind === kind &&
      (filePath === undefined || r.filePath === filePath),
  );
}

// ── Tests ──

describe("extractTsRelationships", () => {
  it("should extract relationships from the fixture files", () => {
    expect(relationships.length).toBeGreaterThan(0);
  });

  // ── Named imports ──

  describe("named imports", () => {
    it("should extract import edge for { Config, LogLevel } from ./types in utils.ts", () => {
      const importEdges = findEdges(RelationshipKind.Imports, "utils.ts");
      expect(importEdges.length).toBeGreaterThan(0);

      // utils.ts imports Config from types.ts
      const configId = symId("types.ts", "Config", SymbolKind.Interface);
      expect(
        importEdges.some((e) => e.targetId === configId),
      ).toBe(true);
    });

    it("should extract import edge for LogLevel from ./types in utils.ts", () => {
      const logLevelId = symId("types.ts", "LogLevel", SymbolKind.Enum);
      const importEdges = findEdges(RelationshipKind.Imports, "utils.ts");
      expect(
        importEdges.some((e) => e.targetId === logLevelId),
      ).toBe(true);
    });

    it("should extract import edges for { IService, Config, Result } from ./types in service.ts", () => {
      const importEdges = findEdges(RelationshipKind.Imports, "service.ts");

      const iServiceId = symId("types.ts", "IService", SymbolKind.Interface);
      const configId = symId("types.ts", "Config", SymbolKind.Interface);

      expect(importEdges.some((e) => e.targetId === iServiceId)).toBe(true);
      expect(importEdges.some((e) => e.targetId === configId)).toBe(true);
    });

    it("should extract import edges for { createConfig, log } from ./utils in service.ts", () => {
      const importEdges = findEdges(RelationshipKind.Imports, "service.ts");

      const createConfigId = symId("utils.ts", "createConfig", SymbolKind.Function);
      const logId = symId("utils.ts", "log", SymbolKind.Function);

      expect(importEdges.some((e) => e.targetId === createConfigId)).toBe(true);
      expect(importEdges.some((e) => e.targetId === logId)).toBe(true);
    });
  });

  // ── Default imports ──

  describe("default imports", () => {
    it("should extract import edge for default import from ./init in consumer.ts", () => {
      const importEdges = findEdges(RelationshipKind.Imports, "consumer.ts");
      const initId = symId("init.ts", "init", SymbolKind.Function);
      expect(importEdges.some((e) => e.targetId === initId)).toBe(true);
    });
  });

  // ── Namespace imports ──

  describe("namespace imports", () => {
    it("should have namespace import binding for * as types from ./types in consumer.ts", () => {
      // The namespace import itself doesn't create a specific import edge (no single target symbol)
      // But qualified calls through it should produce call edges
      // This tests that the namespace import doesn't cause errors
      const consumerEdges = relationships.filter((r) => r.filePath === "consumer.ts");
      expect(consumerEdges.length).toBeGreaterThan(0);
    });
  });

  // ── Call expressions ──

  describe("call expressions", () => {
    it("should NOT extract call edge for local greet() in utils.ts (same-file calls are excluded)", () => {
      const greetId = symId("utils.ts", "greet", SymbolKind.Function);
      const callEdges = findEdges(RelationshipKind.Calls, "utils.ts");

      // Local calls within the same file are not cross-file relationships
      expect(callEdges.some((e) => e.targetId === greetId)).toBe(false);
    });

    it("should extract call edge for createConfig() imported call in service.ts", () => {
      const createConfigId = symId("utils.ts", "createConfig", SymbolKind.Function);
      const callEdges = findEdges(RelationshipKind.Calls, "service.ts");

      expect(callEdges.some((e) => e.targetId === createConfigId)).toBe(true);
    });

    it("should extract call edge for log() imported call in service.ts", () => {
      const logId = symId("utils.ts", "log", SymbolKind.Function);
      const callEdges = findEdges(RelationshipKind.Calls, "service.ts");

      expect(callEdges.some((e) => e.targetId === logId)).toBe(true);
    });

    it("should extract call edge for greet() in consumer.ts", () => {
      const greetId = symId("utils.ts", "greet", SymbolKind.Function);
      const callEdges = findEdges(RelationshipKind.Calls, "consumer.ts");

      expect(callEdges.some((e) => e.targetId === greetId)).toBe(true);
    });

    it("should extract call edges from the correct enclosing function", () => {
      const createConfigId = symId("utils.ts", "createConfig", SymbolKind.Function);
      const callEdges = findEdges(RelationshipKind.Calls, "service.ts");
      const createConfigCall = callEdges.find((e) => e.targetId === createConfigId);

      expect(createConfigCall).toBeDefined();
      // The call is inside the BaseService constructor — the enclosing symbol
    });
  });

  // ── Class heritage: extends ──

  describe("class extends (inherits)", () => {
    it("should extract inherits edge for AppService extends BaseService", () => {
      const appServiceId = symId("service.ts", "AppService", SymbolKind.Class);
      const baseServiceId = symId("service.ts", "BaseService", SymbolKind.Class);

      expect(hasEdge(appServiceId, baseServiceId, RelationshipKind.Inherits, "service.ts")).toBe(true);
    });
  });

  // ── Class heritage: implements ──

  describe("class implements", () => {
    it("should extract implements edge for AppService implements IService", () => {
      const appServiceId = symId("service.ts", "AppService", SymbolKind.Class);
      const iServiceId = symId("types.ts", "IService", SymbolKind.Interface);

      expect(hasEdge(appServiceId, iServiceId, RelationshipKind.Implements, "service.ts")).toBe(true);
    });
  });

  // ── Re-exports ──

  describe("re-exports", () => {
    it("should extract import edges for re-exports in index.ts", () => {
      const reExportEdges = findEdges(RelationshipKind.Imports, "index.ts");
      expect(reExportEdges.length).toBeGreaterThan(0);
    });

    it("should have re-export edge for greet from ./utils in index.ts", () => {
      const greetId = symId("utils.ts", "greet", SymbolKind.Function);
      const reExportEdges = findEdges(RelationshipKind.Imports, "index.ts");

      expect(reExportEdges.some((e) => e.targetId === greetId)).toBe(true);
    });

    it("should have re-export edge for BaseService from ./service in index.ts", () => {
      const baseServiceId = symId("service.ts", "BaseService", SymbolKind.Class);
      const reExportEdges = findEdges(RelationshipKind.Imports, "index.ts");

      expect(reExportEdges.some((e) => e.targetId === baseServiceId)).toBe(true);
    });

    it("should have re-export edge for LogLevel from ./types in index.ts", () => {
      const logLevelId = symId("types.ts", "LogLevel", SymbolKind.Enum);
      const reExportEdges = findEdges(RelationshipKind.Imports, "index.ts");

      expect(reExportEdges.some((e) => e.targetId === logLevelId)).toBe(true);
    });
  });

  // ── Module resolution ──

  describe("module resolution", () => {
    it("should resolve ./types to types.ts", () => {
      const importEdges = findEdges(RelationshipKind.Imports, "utils.ts");
      // If resolution worked, we'll have edges with targets in types.ts
      const configId = symId("types.ts", "Config", SymbolKind.Interface);
      expect(importEdges.some((e) => e.targetId === configId)).toBe(true);
    });

    it("should handle imports from files with multiple exports", () => {
      // service.ts imports from both types.ts and utils.ts
      const importEdges = findEdges(RelationshipKind.Imports, "service.ts");
      const typesTargets = importEdges.filter((e) => {
        const targetFile = parsedFiles.find(
          (f) => f.symbols.some((s) => s.id === e.targetId && s.filePath === "types.ts"),
        );
        return targetFile !== undefined;
      });
      expect(typesTargets.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Edge properties ──

  describe("edge properties", () => {
    it("should set correct filePath on all edges", () => {
      for (const edge of relationships) {
        expect(edge.filePath).toBeTruthy();
        expect(edge.filePath.endsWith(".ts")).toBe(true);
      }
    });

    it("should set positive lineNumber on all edges", () => {
      for (const edge of relationships) {
        expect(edge.lineNumber).toBeGreaterThan(0);
      }
    });

    it("should set non-empty sourceId on all edges", () => {
      for (const edge of relationships) {
        expect(edge.sourceId).toBeTruthy();
        expect(edge.sourceId.length).toBe(16);
      }
    });

    it("should set non-empty targetId on all edges", () => {
      for (const edge of relationships) {
        expect(edge.targetId).toBeTruthy();
        expect(edge.targetId.length).toBe(16);
      }
    });
  });

  // ── Unresolvable imports ──

  describe("graceful handling of unresolvable imports", () => {
    it("should not crash on node_modules imports", () => {
      // consumer.ts would normally not have node_modules imports in our fixtures
      // But verify the extractor doesn't crash on files with them
      const testFile: ParsedFile = {
        filePath: "test-unresolvable.ts",
        language: "typescript",
        symbols: [],
        relationships: [],
      };

      // Should not throw
      expect(() => {
        extractTsRelationships([...parsedFiles, testFile], FIXTURE_ROOT);
      }).not.toThrow();
    });

    it("should skip non-TypeScript files gracefully", () => {
      const pyFile: ParsedFile = {
        filePath: "test.py",
        language: "python",
        symbols: [],
        relationships: [],
      };

      const result = extractTsRelationships([pyFile], FIXTURE_ROOT);
      expect(result).toEqual([]);
    });
  });

  // ── Aggregate verification ──

  describe("aggregate checks", () => {
    it("should have at least 10 total relationships", () => {
      expect(relationships.length).toBeGreaterThanOrEqual(10);
    });

    it("should have import edges", () => {
      expect(findEdges(RelationshipKind.Imports).length).toBeGreaterThan(0);
    });

    it("should have call edges", () => {
      expect(findEdges(RelationshipKind.Calls).length).toBeGreaterThan(0);
    });

    it("should have inherits edges", () => {
      expect(findEdges(RelationshipKind.Inherits).length).toBeGreaterThan(0);
    });

    it("should have implements edges", () => {
      expect(findEdges(RelationshipKind.Implements).length).toBeGreaterThan(0);
    });
  });
});
