/**
 * Plugin Types
 *
 * Plugins extend the daemon with channels, tools, and background services.
 * Each plugin registers its capabilities via typed registries during initialization.
 *
 * Currently restricted to first-party plugins. Third-party plugin loading is planned.
 */

import type { ChannelAdapter } from '../channels/types.ts';

/**
 * A Kata plugin that registers channels, tools, and services with the daemon.
 * All registration methods are optional; a plugin provides whichever capabilities it needs.
 */
export interface KataPlugin {
  /** Unique plugin identifier (e.g., "kata-slack", "kata-gmail") */
  readonly id: string;

  /** Human-readable plugin name */
  readonly name: string;

  /** Semver version string */
  readonly version: string;

  /** Register channel adapters for ingesting external messages */
  registerChannels?(registry: ChannelRegistry): void;

  /** Register tools available to the agent during sessions */
  registerTools?(registry: ToolRegistry): void;

  /** Register background services that run alongside the daemon */
  registerServices?(registry: ServiceRegistry): void;

  /** Called after registration to perform async setup (DB connections, auth checks, etc.) */
  initialize?(context: PluginContext): Promise<void>;

  /** Called during daemon shutdown for graceful cleanup */
  shutdown?(): Promise<void>;
}

/**
 * Registry for channel adapter factories.
 * The daemon calls registered factories when activating channels.
 */
export interface ChannelRegistry {
  /** Register a factory that produces a ChannelAdapter instance on demand */
  addAdapter(id: string, factory: () => ChannelAdapter): void;
}

/**
 * Registry for agent tools.
 * Typed as unknown until Phase 11+ integrates the SDK tool type.
 */
export interface ToolRegistry {
  /** Register a tool definition for use in agent sessions */
  addTool(tool: unknown): void;
}

/**
 * Registry for background services.
 * Services run for the lifetime of the daemon process.
 */
export interface ServiceRegistry {
  /** Register a named background service */
  addService(id: string, service: PluginService): void;
}

/**
 * A long-running background service managed by the daemon.
 * Started when the daemon launches and stopped on shutdown.
 */
export interface PluginService {
  /** Start the service */
  start(): Promise<void>;

  /** Stop the service and release resources */
  stop(): Promise<void>;
}

/**
 * Context provided to plugins during initialization.
 * Gives plugins access to workspace resources without exposing internal daemon state.
 */
export interface PluginContext {
  /**
   * Base path for plugin file resolution.
   * In session context: workspace root (e.g., ~/.kata-agents/workspaces/xxx).
   * In daemon context: global config dir (e.g., ~/.kata-agents/) since the
   * daemon serves multiple workspaces and initializes plugins globally.
   */
  workspaceRootPath: string;

  /** Retrieve a stored credential by source slug. Returns null if not found. */
  getCredential: (sourceSlug: string) => Promise<string | null>;

  /** Structured logger scoped to the plugin */
  logger: PluginLogger;
}

/**
 * Logger interface for plugin-scoped logging.
 * Implementations route to the daemon's centralized log system.
 */
export interface PluginLogger {
  /** Log an informational message */
  info(message: string): void;

  /** Log a warning */
  warn(message: string): void;

  /** Log an error */
  error(message: string): void;

  /** Log a debug-level message (only visible when debug logging is enabled) */
  debug(message: string): void;
}
