/**
 * Pure utility functions for mention trigger detection.
 *
 * Separated from mention-menu.tsx to avoid loading React components
 * and their dependencies (including pdfjs-dist via overlay barrel)
 * when only the pure functions are needed.
 */

/**
 * Check if @ at the given position is a valid mention trigger (should open menu)
 *
 * A valid trigger is when @ appears:
 * - At the start of input (position 0)
 * - After whitespace (space, tab, newline)
 * - After opening parenthesis or quotes
 *
 * This prevents the menu from opening for email addresses (user@domain.com)
 */
export function isValidMentionTrigger(textBeforeCursor: string, atPosition: number): boolean {
  // Invalid position
  if (atPosition < 0) return false

  // @ at start of input - valid trigger
  if (atPosition === 0) return true

  // Get character before the @
  const charBefore = textBeforeCursor[atPosition - 1]

  // Valid triggers: whitespace, opening paren, or quotes
  // \s matches space, tab, newline, carriage return, etc.
  // Also allow ( and quotes as valid "start of word" positions
  const validTriggerChars = /[\s("']/
  return validTriggerChars.test(charBefore)
}
