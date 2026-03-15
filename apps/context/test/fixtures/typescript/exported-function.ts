/**
 * Adds two numbers together.
 * @param a - First number
 * @param b - Second number
 * @returns The sum
 */
export function add(a: number, b: number): number {
  return a + b;
}

export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}
