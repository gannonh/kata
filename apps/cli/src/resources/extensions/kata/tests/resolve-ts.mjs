// Custom ESM resolver: rewrites .js imports to .ts for node --test with TypeScript sources.
// Usage: node --import ./agent/extensions/kata/tests/resolve-ts.mjs --test ...
//
// This is needed because pi extension source files use .js import specifiers
// (the pi runtime bundler convention), but only .ts files exist on disk.
// Node's built-in TypeScript support strips types but doesn't rewrite specifiers.

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { after, afterEach, before, beforeEach, describe, it, test } from 'node:test';

// Provide Bun-like test globals when running Node's test runner so legacy tests
// that use bare `test()` / `describe()` remain executable.
Object.assign(globalThis, {
  after,
  afterAll: after,
  afterEach,
  before,
  beforeAll: before,
  beforeEach,
  describe,
  it,
  test,
});

register(new URL('./resolve-ts-hooks.mjs', import.meta.url), pathToFileURL('./'));
