// Custom ESM resolver: rewrites .js imports to .ts for node --test with TypeScript sources.
// Usage: node --import ./agent/extensions/gsd/tests/resolve-ts.mjs --test ...
//
// This is needed because pi extension source files use .js import specifiers
// (the pi runtime bundler convention), but only .ts files exist on disk.
// Node's built-in TypeScript support strips types but doesn't rewrite specifiers.

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(new URL('./resolve-ts-hooks.mjs', import.meta.url), pathToFileURL('./'));
