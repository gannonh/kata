/**
 * TriggerMatcher
 *
 * Evaluates whether a message should activate the agent based on
 * configurable regex patterns. Empty patterns match all messages.
 */
export class TriggerMatcher {
  private patterns: RegExp[];

  constructor(triggerPatterns: string[]) {
    this.patterns = triggerPatterns.map((pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        throw new Error(`Invalid trigger pattern: ${pattern}`);
      }
    });
  }

  /**
   * Returns true if the content matches at least one trigger pattern,
   * or if no patterns are configured (match-all behavior).
   */
  matches(content: string): boolean {
    if (this.patterns.length === 0) return true;
    return this.patterns.some((p) => p.test(content));
  }
}
