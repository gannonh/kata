/** Multiplies two numbers */
export const multiply = (a: number, b: number): number => a * b;

export const greetAsync = async (name: string): Promise<string> => {
  return `Hello, ${name}!`;
};

const internalHelper = (x: number): number => x * 2;

export const processItems = (items: string[]): string[] => {
  return items.map((item) => item.trim());
};
