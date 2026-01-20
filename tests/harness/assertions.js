import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Assert that a skill was invoked (not just ad-hoc response).
 * Skills execute multiple turns; direct answers are typically 1 turn.
 *
 * @param {Object} result - Claude JSON response
 * @param {string} [message] - Custom failure message
 */
export function assertSkillInvoked(result, message) {
  assert.ok(
    result.num_turns > 1,
    message || `Expected skill invocation (num_turns > 1), got ${result.num_turns} turn(s)`
  );
}

/**
 * Assert the response completed without error.
 *
 * @param {Object} result - Claude JSON response
 * @param {string} [message] - Custom failure message
 */
export function assertNoError(result, message) {
  assert.strictEqual(
    result.is_error,
    false,
    message || `Expected no error, but got: ${result.result?.substring(0, 200)}`
  );
}

/**
 * Assert an artifact was created at the expected path.
 *
 * @param {string} basePath - Test directory base path
 * @param {string} relativePath - Expected file/directory path relative to base
 * @param {string} [message] - Custom failure message
 */
export function assertArtifactExists(basePath, relativePath, message) {
  const fullPath = join(basePath, relativePath);
  assert.ok(
    existsSync(fullPath),
    message || `Expected artifact at ${relativePath}, but it does not exist`
  );
}

/**
 * Assert a directory contains at least one file matching a pattern.
 *
 * @param {string} dirPath - Directory to check
 * @param {RegExp} pattern - Pattern to match filenames against
 * @param {string} [message] - Custom failure message
 */
export function assertFileMatchesPattern(dirPath, pattern, message) {
  if (!existsSync(dirPath)) {
    assert.fail(message || `Directory ${dirPath} does not exist`);
  }

  const files = readdirSync(dirPath);
  const matches = files.filter(f => pattern.test(f));

  assert.ok(
    matches.length > 0,
    message || `Expected file matching ${pattern} in ${dirPath}, found: ${files.join(', ') || '(empty)'}`
  );
}

/**
 * Assert response text contains expected content.
 *
 * @param {Object} result - Claude JSON response
 * @param {string|RegExp} expected - String or pattern to match
 * @param {string} [message] - Custom failure message
 */
export function assertResultContains(result, expected, message) {
  const text = result.result || '';

  if (expected instanceof RegExp) {
    assert.ok(
      expected.test(text),
      message || `Expected result to match ${expected}, got: ${text.substring(0, 200)}...`
    );
  } else {
    assert.ok(
      text.includes(expected),
      message || `Expected result to contain "${expected}", got: ${text.substring(0, 200)}...`
    );
  }
}
