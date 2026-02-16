import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);

/**
 * scan-codebase.cjs Tests
 *
 * Unit tests for extraction functions (stripComments, extractJSImports,
 * extractJSExports, extractPyImports, extractPyExports, extractGoImports,
 * extractGoExports, classifyIdentifier, detectConventions, mergeIndex)
 * and integration test for full scan against fixture directory.
 *
 * Run with: node --test tests/scripts/scan-codebase.test.js
 */

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, 'skills/kata-map-codebase/scripts/scan-codebase.cjs');
const FIXTURE_DIR = path.join(ROOT, 'tests/fixtures/scan-codebase');

// Import the CJS module's exported functions
const mod = require(SCRIPT_PATH);
const {
  stripComments,
  stripPythonComments,
  extractJSImports,
  extractJSExports,
  extractPyImports,
  extractPyExports,
  extractGoImports,
  extractGoExports,
  classifyIdentifier,
  detectConventions,
  mergeIndex,
  isGeneratedFile,
} = mod;

// ─── stripComments ────────────────────────────────────────────────────────────

describe('stripComments', () => {
  test('strips single-line JS comments', () => {
    const source = 'const x = 1; // this is a comment\nconst y = 2;';
    const result = stripComments(source);
    assert.ok(!result.includes('this is a comment'));
    assert.ok(result.includes('const x = 1;'));
    assert.ok(result.includes('const y = 2;'));
  });

  test('strips block comments', () => {
    const source = '/* block comment */\nconst x = 1;';
    const result = stripComments(source);
    assert.ok(!result.includes('block comment'));
    assert.ok(result.includes('const x = 1;'));
  });

  test('strips multi-line block comments', () => {
    const source = '/*\n * multi-line\n * comment\n */\nconst x = 1;';
    const result = stripComments(source);
    assert.ok(!result.includes('multi-line'));
    assert.ok(result.includes('const x = 1;'));
  });

  test('preserves URLs with ://', () => {
    const source = "const url = 'https://api.example.com/v1';";
    const result = stripComments(source);
    assert.ok(result.includes('https://api.example.com/v1'));
  });

  test('handles empty source', () => {
    assert.strictEqual(stripComments(''), '');
  });

  test('handles source with no comments', () => {
    const source = 'const x = 1;\nconst y = 2;';
    const result = stripComments(source);
    assert.strictEqual(result, source);
  });
});

describe('stripPythonComments', () => {
  test('strips hash comments', () => {
    const source = '# this is a comment\ndef foo():\n    pass  # inline comment';
    const result = stripPythonComments(source);
    assert.ok(!result.includes('this is a comment'));
    assert.ok(!result.includes('inline comment'));
    assert.ok(result.includes('def foo():'));
  });

  test('strips triple-quoted strings used as comments', () => {
    const source = '"""This is a docstring"""\ndef foo():\n    pass';
    const result = stripPythonComments(source);
    assert.ok(!result.includes('This is a docstring'));
    assert.ok(result.includes('def foo():'));
  });
});

// ─── extractJSImports ─────────────────────────────────────────────────────────

describe('extractJSImports', () => {
  test('extracts ES module default import', () => {
    const source = "import config from '../config';";
    const result = extractJSImports(source);
    assert.ok(result.local.includes('../config'));
  });

  test('extracts ES module named imports', () => {
    const source = "import { Router, json } from 'express';";
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('express'));
  });

  test('extracts ES module default + named imports', () => {
    const source = "import express, { Router, json } from 'express';";
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('express'));
  });

  test('extracts CommonJS require', () => {
    const source = "const path = require('path');\nconst fs = require('fs');";
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('path'));
    assert.ok(result.packages.includes('fs'));
  });

  test('extracts dynamic imports', () => {
    const source = "const mod = import('./lazy-module');";
    const result = extractJSImports(source);
    assert.ok(result.local.includes('./lazy-module'));
  });

  test('splits packages vs local imports', () => {
    const source = [
      "import express from 'express';",
      "import { foo } from './utils/foo';",
      "const path = require('path');",
      "const bar = require('../bar');",
    ].join('\n');
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('express'));
    assert.ok(result.packages.includes('path'));
    assert.ok(result.local.includes('./utils/foo'));
    assert.ok(result.local.includes('../bar'));
  });

  test('deduplicates imports', () => {
    const source = [
      "import express from 'express';",
      "const e = require('express');",
    ].join('\n');
    const result = extractJSImports(source);
    const expressCount = result.packages.filter(p => p === 'express').length;
    assert.strictEqual(expressCount, 1);
  });

  test('sorts import arrays', () => {
    const source = [
      "import zod from 'zod';",
      "import express from 'express';",
      "import { bar } from './bar';",
      "import { alpha } from './alpha';",
    ].join('\n');
    const result = extractJSImports(source);
    assert.deepStrictEqual(result.packages, ['express', 'zod']);
    assert.deepStrictEqual(result.local, ['./alpha', './bar']);
  });

  test('does not extract imports inside comments (stripped internally)', () => {
    const source = [
      "// import fakeModule from 'should-not-appear';",
      "import real from 'real-package';",
    ].join('\n');
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('real-package'));
    assert.ok(!result.packages.includes('should-not-appear'));
  });

  test('handles type imports in TypeScript', () => {
    const source = "import type { UserType } from './types';";
    const result = extractJSImports(source);
    assert.ok(result.local.includes('./types'));
  });

  test('treats @/ prefix as local import', () => {
    const source = "import { foo } from '@/utils/foo';";
    const result = extractJSImports(source);
    assert.ok(result.local.includes('@/utils/foo'));
    assert.ok(!result.packages.includes('@/utils/foo'));
  });

  test('extracts from sample.js fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.js'), 'utf8');
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('express'), 'should have express');
    assert.ok(result.packages.includes('fs'), 'should have fs');
    assert.ok(result.packages.includes('path'), 'should have path');
    assert.ok(result.local.includes('../config'), 'should have ../config');
    assert.ok(result.local.includes('./utils/hash'), 'should have ./utils/hash');
    assert.ok(result.local.includes('./lazy-module'), 'should have ./lazy-module');
    // Commented import should NOT be present (stripComments runs internally)
    assert.ok(!result.packages.includes('should-not-appear'), 'should not have commented import');
  });

  test('extracts from sample.ts fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.ts'), 'utf8');
    const result = extractJSImports(source);
    assert.ok(result.packages.includes('express'), 'should have express');
    assert.ok(result.local.includes('./models/user'), 'should have ./models/user');
    assert.ok(result.local.includes('./types'), 'should have ./types');
  });
});

// ─── extractJSExports ─────────────────────────────────────────────────────────

describe('extractJSExports', () => {
  test('extracts const export', () => {
    const source = "export const API_VERSION = '2.0';";
    const result = extractJSExports(source);
    assert.ok(result.includes('API_VERSION'));
  });

  test('extracts function export', () => {
    const source = 'export function createServer(port) { return null; }';
    const result = extractJSExports(source);
    assert.ok(result.includes('createServer'));
  });

  test('extracts class export', () => {
    const source = 'export class AppRouter {}';
    const result = extractJSExports(source);
    assert.ok(result.includes('AppRouter'));
  });

  test('extracts default class export', () => {
    const source = 'export default class UserController {}';
    const result = extractJSExports(source);
    assert.ok(result.includes('UserController'));
  });

  test('extracts default function export', () => {
    const source = 'export default function main() {}';
    const result = extractJSExports(source);
    assert.ok(result.includes('main'));
  });

  test('extracts TypeScript type export', () => {
    const source = 'export type UserId = string;';
    const result = extractJSExports(source);
    assert.ok(result.includes('UserId'));
  });

  test('extracts TypeScript interface export', () => {
    const source = 'export interface UserService { getUser(): void; }';
    const result = extractJSExports(source);
    assert.ok(result.includes('UserService'));
  });

  test('extracts TypeScript enum export', () => {
    const source = 'export enum Status { Active, Inactive }';
    const result = extractJSExports(source);
    assert.ok(result.includes('Status'));
  });

  test('extracts CJS module.exports object', () => {
    const source = 'module.exports = { foo, bar, baz };';
    const result = extractJSExports(source);
    assert.ok(result.includes('foo'));
    assert.ok(result.includes('bar'));
    assert.ok(result.includes('baz'));
  });

  test('deduplicates and sorts exports', () => {
    const source = [
      'export function zebra() {}',
      'export function alpha() {}',
    ].join('\n');
    const result = extractJSExports(source);
    assert.deepStrictEqual(result, ['alpha', 'zebra']);
  });

  test('extracts from sample.js fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.js'), 'utf8');
    const result = extractJSExports(source);
    assert.ok(result.includes('API_VERSION'), 'should have API_VERSION');
    assert.ok(result.includes('createServer'), 'should have createServer');
    assert.ok(result.includes('AppRouter'), 'should have AppRouter');
  });

  test('extracts from sample.ts fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.ts'), 'utf8');
    const result = extractJSExports(source);
    assert.ok(result.includes('UserService'), 'should have UserService');
    assert.ok(result.includes('UserId'), 'should have UserId');
    assert.ok(result.includes('DEFAULT_ROLE'), 'should have DEFAULT_ROLE');
    assert.ok(result.includes('Status'), 'should have Status');
    assert.ok(result.includes('validateUser'), 'should have validateUser');
    assert.ok(result.includes('UserController'), 'should have UserController');
  });
});

// ─── extractPyImports ─────────────────────────────────────────────────────────

describe('extractPyImports', () => {
  test('extracts simple import', () => {
    const source = 'import os\nimport sys';
    const result = extractPyImports(source);
    assert.ok(result.packages.includes('os'));
    assert.ok(result.packages.includes('sys'));
  });

  test('extracts from..import', () => {
    const source = 'from pathlib import Path';
    const result = extractPyImports(source);
    assert.ok(result.packages.includes('pathlib'));
  });

  test('extracts relative imports as local', () => {
    const source = 'from .models import User\nfrom ..utils import hash_password';
    const result = extractPyImports(source);
    assert.ok(result.local.includes('.models'));
    assert.ok(result.local.includes('..utils'));
  });

  test('extracts from sample.py fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.py'), 'utf8');
    const result = extractPyImports(source);
    assert.ok(result.packages.includes('os'), 'should have os');
    assert.ok(result.packages.includes('sys'), 'should have sys');
    assert.ok(result.packages.includes('pathlib'), 'should have pathlib');
    assert.ok(result.packages.includes('typing'), 'should have typing');
    assert.ok(result.local.includes('.models'), 'should have .models');
    assert.ok(result.local.includes('..utils'), 'should have ..utils');
  });
});

// ─── extractPyExports ─────────────────────────────────────────────────────────

describe('extractPyExports', () => {
  test('extracts function definitions', () => {
    const source = 'def create_user(name):\n    pass';
    const result = extractPyExports(source);
    assert.ok(result.includes('create_user'));
  });

  test('extracts class definitions', () => {
    const source = 'class UserRepository:\n    pass';
    const result = extractPyExports(source);
    assert.ok(result.includes('UserRepository'));
  });

  test('does not extract private functions (underscore prefix)', () => {
    const source = 'def _private_helper():\n    pass';
    const result = extractPyExports(source);
    assert.ok(!result.includes('_private_helper'));
  });

  test('extracts from sample.py fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.py'), 'utf8');
    const result = extractPyExports(source);
    assert.ok(result.includes('create_user'), 'should have create_user');
    assert.ok(result.includes('UserRepository'), 'should have UserRepository');
  });
});

// ─── extractGoImports ─────────────────────────────────────────────────────────

describe('extractGoImports', () => {
  test('extracts single-line import', () => {
    const source = 'import "fmt"';
    const result = extractGoImports(source);
    assert.ok(result.packages.includes('fmt'));
  });

  test('extracts import block', () => {
    const source = 'import (\n\t"fmt"\n\t"net/http"\n\t"github.com/gin-gonic/gin"\n)';
    const result = extractGoImports(source);
    assert.ok(result.packages.includes('fmt'));
    assert.ok(result.packages.includes('net/http'));
    assert.ok(result.packages.includes('github.com/gin-gonic/gin'));
  });

  test('returns empty local array (Go has no relative imports)', () => {
    const source = 'import "fmt"';
    const result = extractGoImports(source);
    assert.deepStrictEqual(result.local, []);
  });

  test('extracts from sample.go fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.go'), 'utf8');
    const result = extractGoImports(source);
    assert.ok(result.packages.includes('fmt'), 'should have fmt');
    assert.ok(result.packages.includes('net/http'), 'should have net/http');
    assert.ok(result.packages.includes('github.com/gin-gonic/gin'), 'should have gin');
  });
});

// ─── extractGoExports ─────────────────────────────────────────────────────────

describe('extractGoExports', () => {
  test('extracts capitalized function as export', () => {
    const source = 'func StartServer(port int) {}';
    const result = extractGoExports(source);
    assert.ok(result.includes('StartServer'));
  });

  test('does not export lowercase function', () => {
    const source = 'func helperFunc() string { return "" }';
    const result = extractGoExports(source);
    assert.ok(!result.includes('helperFunc'));
  });

  test('extracts from sample.go fixture', () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, 'sample.go'), 'utf8');
    const result = extractGoExports(source);
    assert.ok(result.includes('StartServer'), 'should have StartServer');
    assert.ok(result.includes('HandleRequest'), 'should have HandleRequest');
    assert.ok(!result.includes('helperFunc'), 'should NOT have helperFunc');
  });
});

// ─── classifyIdentifier ───────────────────────────────────────────────────────

describe('classifyIdentifier', () => {
  test('classifies camelCase', () => {
    assert.strictEqual(classifyIdentifier('createServer'), 'camelCase');
    assert.strictEqual(classifyIdentifier('getUserById'), 'camelCase');
    assert.strictEqual(classifyIdentifier('x'), 'camelCase');
  });

  test('classifies PascalCase', () => {
    assert.strictEqual(classifyIdentifier('AppRouter'), 'PascalCase');
    assert.strictEqual(classifyIdentifier('UserController'), 'PascalCase');
    assert.strictEqual(classifyIdentifier('X'), 'PascalCase');
  });

  test('classifies snake_case', () => {
    assert.strictEqual(classifyIdentifier('create_user'), 'snake_case');
    assert.strictEqual(classifyIdentifier('hash_password'), 'snake_case');
  });

  test('classifies SCREAMING_SNAKE', () => {
    assert.strictEqual(classifyIdentifier('API_VERSION'), 'SCREAMING_SNAKE');
    assert.strictEqual(classifyIdentifier('MAX_RETRIES'), 'SCREAMING_SNAKE');
    assert.strictEqual(classifyIdentifier('HTTP_200'), 'SCREAMING_SNAKE');
  });

  test('classifies other for mixed patterns', () => {
    assert.strictEqual(classifyIdentifier('some_Mixed_Case'), 'other');
  });

  test('single uppercase letter is PascalCase not SCREAMING_SNAKE', () => {
    assert.strictEqual(classifyIdentifier('X'), 'PascalCase');
  });

  test('SCREAMING_SNAKE requires underscore', () => {
    // "ABC" matches /^[A-Z][A-Z0-9_]+$/ but has no underscore
    assert.strictEqual(classifyIdentifier('ABC'), 'PascalCase');
  });

  test('single lowercase letter is camelCase', () => {
    assert.strictEqual(classifyIdentifier('x'), 'camelCase');
  });
});

// ─── detectConventions ────────────────────────────────────────────────────────

describe('detectConventions', () => {
  test('returns insufficient_data with fewer than 5 exports', () => {
    const fileIndex = {
      'a.js': { exports: ['foo', 'bar'] },
      'b.js': { exports: ['baz', 'qux'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.pattern, 'insufficient_data');
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result.sampleSize, 4);
  });

  test('detects convention with exactly 5 exports (minimum threshold)', () => {
    const fileIndex = {
      'a.js': { exports: ['foo', 'bar', 'baz'] },
      'b.js': { exports: ['qux', 'quux'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.sampleSize, 5);
    assert.strictEqual(result.pattern, 'camelCase');
    assert.ok(result.confidence >= 0.7);
  });

  test('returns mixed when confidence is below 70%', () => {
    // 10 exports: 6 camelCase + 4 PascalCase = 60% camelCase
    const fileIndex = {
      'a.js': { exports: ['foo', 'bar', 'baz', 'qux', 'quux', 'corge'] },
      'b.js': { exports: ['Alpha', 'Beta', 'Gamma', 'Delta'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.pattern, 'mixed');
    assert.ok(result.confidence < 0.7);
    assert.strictEqual(result.sampleSize, 10);
    assert.ok(result.breakdown);
    assert.strictEqual(result.breakdown.camelCase, 6);
    assert.strictEqual(result.breakdown.PascalCase, 4);
  });

  test('confidence boundary: 69% returns mixed', () => {
    // 100 exports: 69 camelCase + 31 PascalCase
    const camelNames = Array.from({ length: 69 }, (_, i) => `camel${String.fromCharCode(97 + (i % 26))}${i}`);
    const pascalNames = Array.from({ length: 31 }, (_, i) => `Pascal${i}`);
    const fileIndex = {
      'a.js': { exports: camelNames },
      'b.js': { exports: pascalNames },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.sampleSize, 100);
    // 69/100 = 0.69, below 0.70 threshold
    assert.strictEqual(result.pattern, 'mixed');
    assert.ok(result.confidence < 0.7, `confidence ${result.confidence} should be < 0.7`);
  });

  test('confidence boundary: 71% returns dominant pattern', () => {
    // 100 exports: 71 camelCase + 29 PascalCase
    const camelNames = Array.from({ length: 71 }, (_, i) => `camel${String.fromCharCode(97 + (i % 26))}${i}`);
    const pascalNames = Array.from({ length: 29 }, (_, i) => `Pascal${i}`);
    const fileIndex = {
      'a.js': { exports: camelNames },
      'b.js': { exports: pascalNames },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.sampleSize, 100);
    assert.strictEqual(result.pattern, 'camelCase');
    assert.ok(result.confidence >= 0.7, `confidence ${result.confidence} should be >= 0.7`);
  });

  test('confidence boundary: exactly 70% returns dominant pattern', () => {
    // 10 exports: 7 camelCase + 3 PascalCase = 70%
    const fileIndex = {
      'a.js': { exports: ['foo', 'bar', 'baz', 'qux', 'quux', 'corge', 'grault'] },
      'b.js': { exports: ['Alpha', 'Beta', 'Gamma'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.sampleSize, 10);
    assert.strictEqual(result.pattern, 'camelCase');
    assert.ok(result.confidence >= 0.7, `confidence ${result.confidence} should be >= 0.7`);
  });

  test('4 exports returns insufficient_data', () => {
    const fileIndex = {
      'a.js': { exports: ['foo', 'bar'] },
      'b.js': { exports: ['baz', 'qux'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.pattern, 'insufficient_data');
    assert.strictEqual(result.sampleSize, 4);
  });

  test('detects PascalCase convention', () => {
    const fileIndex = {
      'a.ts': { exports: ['UserService', 'UserController', 'AuthService', 'AuthController', 'AppModule'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.pattern, 'PascalCase');
    assert.strictEqual(result.confidence, 1);
  });

  test('detects snake_case convention', () => {
    const fileIndex = {
      'a.py': { exports: ['create_user', 'get_user', 'delete_user', 'update_user', 'list_users'] },
    };
    const result = detectConventions(fileIndex);
    assert.strictEqual(result.pattern, 'snake_case');
    assert.strictEqual(result.confidence, 1);
  });

  test('empty file index returns insufficient_data', () => {
    const result = detectConventions({});
    assert.strictEqual(result.pattern, 'insufficient_data');
    assert.strictEqual(result.sampleSize, 0);
  });
});

// ─── mergeIndex ───────────────────────────────────────────────────────────────

describe('mergeIndex', () => {
  test('adds new file entries', () => {
    const existing = {
      files: {
        'a.js': { exports: ['foo'], imports: { packages: [], local: [] } },
      },
    };
    const scanned = {
      'b.js': { exports: ['bar'], imports: { packages: ['express'], local: [] } },
    };
    const result = mergeIndex(existing, scanned, []);
    assert.ok(result['a.js'], 'existing entry preserved');
    assert.ok(result['b.js'], 'new entry added');
    assert.deepStrictEqual(result['b.js'].exports, ['bar']);
  });

  test('updates existing file entries', () => {
    const existing = {
      files: {
        'a.js': { exports: ['foo'], imports: { packages: [], local: [] } },
      },
    };
    const scanned = {
      'a.js': { exports: ['foo', 'bar'], imports: { packages: ['lodash'], local: [] } },
    };
    const result = mergeIndex(existing, scanned, []);
    assert.deepStrictEqual(result['a.js'].exports, ['foo', 'bar']);
    assert.deepStrictEqual(result['a.js'].imports.packages, ['lodash']);
  });

  test('removes deleted file entries', () => {
    const existing = {
      files: {
        'a.js': { exports: ['foo'], imports: { packages: [], local: [] } },
        'b.js': { exports: ['bar'], imports: { packages: [], local: [] } },
      },
    };
    const scanned = {};
    const result = mergeIndex(existing, scanned, ['b.js']);
    assert.ok(result['a.js'], 'non-deleted entry preserved');
    assert.ok(!result['b.js'], 'deleted entry removed');
  });

  test('handles simultaneous add, update, delete', () => {
    const existing = {
      files: {
        'keep.js': { exports: ['keep'] },
        'update.js': { exports: ['old'] },
        'delete.js': { exports: ['gone'] },
      },
    };
    const scanned = {
      'update.js': { exports: ['new'] },
      'add.js': { exports: ['fresh'] },
    };
    const result = mergeIndex(existing, scanned, ['delete.js']);
    assert.ok(result['keep.js'], 'untouched entry preserved');
    assert.deepStrictEqual(result['update.js'].exports, ['new']);
    assert.ok(result['add.js'], 'new entry added');
    assert.ok(!result['delete.js'], 'deleted entry removed');
  });

  test('handles existing with no files property', () => {
    const existing = {};
    const scanned = { 'a.js': { exports: ['foo'] } };
    const result = mergeIndex(existing, scanned, []);
    assert.ok(result['a.js'], 'new entry added');
  });
});

// ─── isGeneratedFile ──────────────────────────────────────────────────────────

describe('isGeneratedFile', () => {
  test('detects .generated.ts files', () => {
    assert.ok(isGeneratedFile('foo.generated.ts', ''));
  });

  test('detects .gen.ts files', () => {
    assert.ok(isGeneratedFile('foo.gen.ts', ''));
  });

  test('detects _pb.ts files', () => {
    assert.ok(isGeneratedFile('user_pb.ts', ''));
  });

  test('detects _grpc.ts files', () => {
    assert.ok(isGeneratedFile('user_grpc.ts', ''));
  });

  test('detects @generated marker in first 5 lines', () => {
    const source = '// @generated\nexport const x = 1;';
    assert.ok(isGeneratedFile('normal.ts', source));
  });

  test('detects DO NOT EDIT marker in first 5 lines', () => {
    const source = '// DO NOT EDIT\nexport const x = 1;';
    assert.ok(isGeneratedFile('normal.ts', source));
  });

  test('does not flag normal files', () => {
    const source = 'export const x = 1;\n// normal file';
    assert.ok(!isGeneratedFile('normal.ts', source));
  });

  test('does not flag @generated after first 5 lines', () => {
    const source = 'line1\nline2\nline3\nline4\nline5\nline6\n// @generated';
    assert.ok(!isGeneratedFile('normal.ts', source));
  });
});

// ─── Integration: Full fixture scan ──────────────────────────────────────────

describe('integration: fixture scan', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kata-scan-int-')));
    fs.mkdirSync(path.join(tmpDir, '.planning/intel'), { recursive: true });

    // Initialize git repo
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Copy fixture files into the project src/ directory
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    for (const file of fs.readdirSync(FIXTURE_DIR)) {
      fs.copyFileSync(
        path.join(FIXTURE_DIR, file),
        path.join(srcDir, file),
      );
    }

    // Add and commit so git ls-files works
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('produces valid index.json with version 2', () => {
    execSync(`node "${SCRIPT_PATH}"`, {
      cwd: tmpDir,
      env: { ...process.env, KATA_PROJECT_ROOT: tmpDir },
      stdio: 'pipe',
    });

    const indexPath = path.join(tmpDir, '.planning/intel/index.json');
    assert.ok(fs.existsSync(indexPath), 'index.json should exist');

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert.strictEqual(index.version, 2);
    assert.ok(index.generated, 'should have generated timestamp');
    assert.strictEqual(index.source, 'code-scan');
    assert.ok(index.commitHash, 'should have commitHash');
    assert.ok(index.files, 'should have files object');
    assert.ok(index.stats, 'should have stats object');
    assert.ok(typeof index.stats.totalFiles === 'number');
  });

  test('index.json contains scanned fixture files with correct structure', () => {
    execSync(`node "${SCRIPT_PATH}"`, {
      cwd: tmpDir,
      env: { ...process.env, KATA_PROJECT_ROOT: tmpDir },
      stdio: 'pipe',
    });

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning/intel/index.json'), 'utf8'));

    // Check JS file entry
    const jsFile = index.files['src/sample.js'];
    assert.ok(jsFile, 'should have src/sample.js entry');
    assert.ok(Array.isArray(jsFile.exports), 'exports should be array');
    assert.ok(jsFile.imports, 'should have imports');
    assert.ok(Array.isArray(jsFile.imports.packages), 'imports.packages should be array');
    assert.ok(Array.isArray(jsFile.imports.local), 'imports.local should be array');
    assert.ok(jsFile.lastIndexed, 'should have lastIndexed');
    assert.ok(jsFile.indexedAt, 'should have indexedAt');

    // Verify JS exports from fixture
    assert.ok(jsFile.exports.includes('API_VERSION'), 'JS exports should include API_VERSION');
    assert.ok(jsFile.exports.includes('createServer'), 'JS exports should include createServer');
    assert.ok(jsFile.exports.includes('AppRouter'), 'JS exports should include AppRouter');

    // Verify JS imports
    assert.ok(jsFile.imports.packages.includes('express'), 'JS packages should include express');

    // Check Python file entry
    const pyFile = index.files['src/sample.py'];
    assert.ok(pyFile, 'should have src/sample.py entry');
    assert.ok(pyFile.exports.includes('create_user'), 'Py exports should include create_user');

    // Check Go file entry
    const goFile = index.files['src/sample.go'];
    assert.ok(goFile, 'should have src/sample.go entry');
    assert.ok(goFile.exports.includes('StartServer'), 'Go exports should include StartServer');
    assert.ok(!goFile.exports.includes('helperFunc'), 'Go exports should NOT include helperFunc');
  });

  test('generated file is excluded from index', () => {
    execSync(`node "${SCRIPT_PATH}"`, {
      cwd: tmpDir,
      env: { ...process.env, KATA_PROJECT_ROOT: tmpDir },
      stdio: 'pipe',
    });

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning/intel/index.json'), 'utf8'));
    assert.ok(!index.files['src/generated.generated.ts'], 'generated file should be excluded');
  });

  test('produces valid conventions.json with version 2', () => {
    execSync(`node "${SCRIPT_PATH}"`, {
      cwd: tmpDir,
      env: { ...process.env, KATA_PROJECT_ROOT: tmpDir },
      stdio: 'pipe',
    });

    const convPath = path.join(tmpDir, '.planning/intel/conventions.json');
    assert.ok(fs.existsSync(convPath), 'conventions.json should exist');

    const conv = JSON.parse(fs.readFileSync(convPath, 'utf8'));
    assert.strictEqual(conv.version, 2);
    assert.ok(conv.generated, 'should have generated timestamp');
    assert.ok(conv.commitHash, 'should have commitHash');
    assert.ok(conv.naming, 'should have naming');
    assert.ok(conv.naming.exports, 'should have naming.exports');
    assert.ok(typeof conv.naming.exports.pattern === 'string', 'naming.exports.pattern should be string');
    assert.ok(typeof conv.naming.exports.confidence === 'number', 'naming.exports.confidence should be number');
    assert.ok(typeof conv.naming.exports.sampleSize === 'number', 'naming.exports.sampleSize should be number');
    assert.ok(conv.directories, 'should have directories');
  });

  test('stats include byExtension counts', () => {
    execSync(`node "${SCRIPT_PATH}"`, {
      cwd: tmpDir,
      env: { ...process.env, KATA_PROJECT_ROOT: tmpDir },
      stdio: 'pipe',
    });

    const index = JSON.parse(fs.readFileSync(path.join(tmpDir, '.planning/intel/index.json'), 'utf8'));
    assert.ok(index.stats.byExtension, 'should have byExtension stats');
    assert.ok(typeof index.stats.byExtension === 'object');
  });
});
