/**
 * Utility functions for the mixed test project.
 */

/** Format a greeting message */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/** Calculate the sum of an array */
export function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}

export interface Config {
  name: string;
  debug: boolean;
}
