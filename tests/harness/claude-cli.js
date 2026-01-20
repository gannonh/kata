import { execSync } from 'node:child_process';

/**
 * Invoke Claude CLI with programmatic flags for testing.
 *
 * @param {string} prompt - The prompt to send to Claude
 * @param {Object} options - Configuration options
 * @param {string} options.cwd - Working directory for execution
 * @param {string} [options.allowedTools='Read,Bash,Glob,Write'] - Tools to allow
 * @param {number} [options.maxBudget=1.00] - Max cost in USD
 * @param {number} [options.timeout=120000] - Timeout in ms
 * @returns {Object} Parsed JSON response from Claude
 */
export function invokeClaude(prompt, options = {}) {
  const {
    cwd,
    allowedTools = 'Read,Bash,Glob,Write',
    maxBudget = 1.00,
    timeout = 120000
  } = options;

  if (!cwd) {
    throw new Error('cwd is required for test isolation');
  }

  const args = [
    '-p', JSON.stringify(prompt),
    '--output-format', 'json',
    '--allowedTools', JSON.stringify(allowedTools),
    '--max-budget-usd', String(maxBudget),
    '--no-session-persistence'
  ];

  const result = execSync(`claude ${args.join(' ')}`, {
    encoding: 'utf8',
    cwd,
    timeout,
    // Capture stderr separately to avoid JSON parsing issues
    stdio: ['pipe', 'pipe', 'pipe']
  });

  return JSON.parse(result);
}
