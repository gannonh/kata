/**
 * Test runner configuration for Kata skill tests.
 *
 * This file provides optional configuration and utilities for the test suite.
 * Tests can be run directly with `node --test` or via this runner for
 * additional features like custom reporters or parallel execution control.
 *
 * Usage:
 *   npm test                    # Run all tests
 *   npm run test:skills         # Run skill tests only
 *   node tests/harness/runner.js # Custom runner (future)
 */

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = join(__dirname, '..');

// Default configuration
export const config = {
  // Cost limits for different test types
  budgets: {
    quick: 0.50,    // Simple skill trigger tests
    standard: 2.00, // Full skill workflow tests
    expensive: 5.00 // Complex multi-turn tests
  },

  // Timeouts (ms)
  timeouts: {
    quick: 60000,    // 1 min
    standard: 180000, // 3 min
    expensive: 300000 // 5 min
  },

  // Test isolation
  isolation: {
    tempPrefix: 'kata-test-',
    cleanupOnFailure: true
  }
};

// Run tests if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Kata Test Runner');
  console.log('================');
  console.log('Running: npm test');
  console.log('');

  // For now, just provide helpful output
  // Future: custom parallel execution, cost tracking, etc.
}
