import { Config, LogLevel } from "./types";

/** Format a greeting message. */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/** Create a default config. */
export function createConfig(name: string): Config {
  return { name, debug: false };
}

/** Log a message at the given level. */
export function log(level: LogLevel, message: string): void {
  console.log(`[${level}] ${message}`);
}

/** Helper that calls greet internally. */
export function welcome(name: string): string {
  const greeting = greet(name);
  log(LogLevel.Info, greeting);
  return greeting;
}
