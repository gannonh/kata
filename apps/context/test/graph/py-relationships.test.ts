/**
 * Tests for Python cross-file relationship extraction.
 *
 * Uses fixture files in test/fixtures/relationships/py/ to verify
 * correct extraction of imports, inherits edges.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { extractPyRelationships } from "../../src/graph/py-relationships.js";
import { parseFile } from "../../src/parser/index.js";
import { generateSymbolId } from "../../src/parser/common.js";
import type { ParsedFile, Relationship } from "../../src/types.js";
import { RelationshipKind, SymbolKind } from "../../src/types.js";

// ── Setup ──

const FIXTURE_ROOT = resolve(__dirname, "../fixtures/relationships/py");

function parseFixture(filename: string): ParsedFile {
  return parseFile(filename, { rootPath: FIXTURE_ROOT });
}

function symId(file: string, name: string, kind: SymbolKind): string {
  return generateSymbolId(file, name, kind);
}

function fileModuleId(file: string): string {
  return generateSymbolId(file, "<module>", SymbolKind.Module);
}

// Parse all fixtures once
let parsedFiles: ParsedFile[];
let relationships: Relationship[];

beforeAll(() => {
  parsedFiles = [
    parseFixture("__init__.py"),
    parseFixture("models.py"),
    parseFixture("utils.py"),
    parseFixture("service.py"),
    parseFixture("subpkg/__init__.py"),
    parseFixture("subpkg/helper.py"),
  ];

  relationships = extractPyRelationships(parsedFiles, FIXTURE_ROOT);
});

// ── Helpers ──

function findEdges(kind: RelationshipKind, filePath?: string): Relationship[] {
  return relationships.filter(
    (r) => r.kind === kind && (!filePath || r.filePath === filePath),
  );
}

function hasEdge(
  sourceId: string,
  targetId: string,
  kind: RelationshipKind,
): boolean {
  return relationships.some(
    (r) => r.sourceId === sourceId && r.targetId === targetId && r.kind === kind,
  );
}

// ── Tests ──

describe("extractPyRelationships", () => {
  it("should return relationships", () => {
    expect(relationships.length).toBeGreaterThan(0);
  });

  it("should only process Python files", () => {
    for (const rel of relationships) {
      expect(rel.filePath).toMatch(/\.py$/);
    }
  });

  // ── from X import Y ──

  describe("from-import statements", () => {
    it("should extract 'from models import User' in utils.py", () => {
      expect(
        hasEdge(
          fileModuleId("utils.py"),
          symId("models.py", "User", SymbolKind.Class),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });

    it("should extract 'from models import BaseModel' in service.py", () => {
      expect(
        hasEdge(
          fileModuleId("service.py"),
          symId("models.py", "BaseModel", SymbolKind.Class),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });

    it("should extract 'from models import User' in service.py", () => {
      expect(
        hasEdge(
          fileModuleId("service.py"),
          symId("models.py", "User", SymbolKind.Class),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });

    it("should extract 'from utils import format_user' in service.py", () => {
      expect(
        hasEdge(
          fileModuleId("service.py"),
          symId("utils.py", "format_user", SymbolKind.Function),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });

    it("should extract 'from utils import helper' in service.py", () => {
      expect(
        hasEdge(
          fileModuleId("service.py"),
          symId("utils.py", "helper", SymbolKind.Function),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });

    it("should extract multiple imports from same module", () => {
      const serviceImports = findEdges(RelationshipKind.Imports, "service.py");
      // from models import BaseModel, User + from utils import format_user, helper + import models
      expect(serviceImports.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ── import X ──

  describe("import statements", () => {
    it("should extract 'import models' in service.py", () => {
      expect(
        hasEdge(
          fileModuleId("service.py"),
          fileModuleId("models.py"),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });
  });

  // ── Relative imports ──

  describe("relative imports", () => {
    it("should extract 'from ..models import User' in subpkg/helper.py", () => {
      expect(
        hasEdge(
          fileModuleId("subpkg/helper.py"),
          symId("models.py", "User", SymbolKind.Class),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });

    it("should extract 'from ..utils import format_user' in subpkg/helper.py", () => {
      expect(
        hasEdge(
          fileModuleId("subpkg/helper.py"),
          symId("utils.py", "format_user", SymbolKind.Function),
          RelationshipKind.Imports,
        ),
      ).toBe(true);
    });
  });

  // ── Class inheritance ──

  describe("class inheritance", () => {
    it("should extract User extends BaseModel in models.py (local)", () => {
      expect(
        hasEdge(
          symId("models.py", "User", SymbolKind.Class),
          symId("models.py", "BaseModel", SymbolKind.Class),
          RelationshipKind.Inherits,
        ),
      ).toBe(true);
    });

    it("should extract Admin extends User in models.py (local)", () => {
      expect(
        hasEdge(
          symId("models.py", "Admin", SymbolKind.Class),
          symId("models.py", "User", SymbolKind.Class),
          RelationshipKind.Inherits,
        ),
      ).toBe(true);
    });

    it("should extract UserService extends BaseModel in service.py (imported)", () => {
      expect(
        hasEdge(
          symId("service.py", "UserService", SymbolKind.Class),
          symId("models.py", "BaseModel", SymbolKind.Class),
          RelationshipKind.Inherits,
        ),
      ).toBe(true);
    });

    it("should extract AdminService extends UserService in service.py (local)", () => {
      expect(
        hasEdge(
          symId("service.py", "AdminService", SymbolKind.Class),
          symId("service.py", "UserService", SymbolKind.Class),
          RelationshipKind.Inherits,
        ),
      ).toBe(true);
    });

    it("should extract SpecialUser extends User in subpkg/helper.py (relative import)", () => {
      expect(
        hasEdge(
          symId("subpkg/helper.py", "SpecialUser", SymbolKind.Class),
          symId("models.py", "User", SymbolKind.Class),
          RelationshipKind.Inherits,
        ),
      ).toBe(true);
    });
  });

  // ── Edge cases ──

  describe("edge cases", () => {
    it("should handle __init__.py files without errors", () => {
      // __init__.py has no imports or classes — should produce no edges for it
      const initEdges = relationships.filter(
        (r) => r.filePath === "__init__.py",
      );
      // No imports in __init__.py
      expect(initEdges.length).toBe(0);
    });

    it("should not produce edges for third-party imports", () => {
      // If any file had `import os` or `from typing import List`, those should be skipped
      for (const rel of relationships) {
        expect(rel.filePath).not.toContain("os.py");
        expect(rel.filePath).not.toContain("typing.py");
      }
    });

    it("all edges should have valid line numbers", () => {
      for (const rel of relationships) {
        expect(rel.lineNumber).toBeGreaterThan(0);
      }
    });

    it("all edges should have non-empty source and target IDs", () => {
      for (const rel of relationships) {
        expect(rel.sourceId).toBeTruthy();
        expect(rel.targetId).toBeTruthy();
        expect(rel.sourceId.length).toBe(16);
        expect(rel.targetId.length).toBe(16);
      }
    });
  });

  // ── Summary counts ──

  describe("summary", () => {
    it("should produce import edges", () => {
      const imports = findEdges(RelationshipKind.Imports);
      expect(imports.length).toBeGreaterThanOrEqual(7);
    });

    it("should produce inherits edges", () => {
      const inherits = findEdges(RelationshipKind.Inherits);
      expect(inherits.length).toBeGreaterThanOrEqual(5);
    });

    it("should not produce calls or implements edges (Python extractor doesn't extract these)", () => {
      const calls = findEdges(RelationshipKind.Calls);
      const implements_ = findEdges(RelationshipKind.Implements);
      expect(calls.length).toBe(0);
      expect(implements_.length).toBe(0);
    });
  });
});
