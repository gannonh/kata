/** User configuration options. */
export interface Config {
  name: string;
  debug: boolean;
}

/** Base interface for all services. */
export interface IService {
  start(): void;
  stop(): void;
}

/** Result wrapper for API responses. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Log level enum. */
export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}
