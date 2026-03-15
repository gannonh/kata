/** Configuration for the application */
export interface AppConfig {
  port: number;
  host: string;
  debug: boolean;
}

/** Extended config with database settings */
export interface DatabaseConfig extends AppConfig {
  connectionString: string;
  poolSize: number;
}

/** Unique user identifier */
export type UserId = string;

/** Union of possible status values */
export type Status = "active" | "inactive" | "pending";

/** Result of an operation */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
