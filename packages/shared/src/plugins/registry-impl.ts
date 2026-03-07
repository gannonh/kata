/**
 * Plugin Registry Implementations
 *
 * Concrete implementations of the ChannelRegistry, ToolRegistry, and ServiceRegistry
 * interfaces. Used internally by PluginManager to collect plugin registrations.
 */

import type { ChannelAdapter } from '../channels/types.ts';
import type { ChannelRegistry, ToolRegistry, ServiceRegistry, PluginService } from './types.ts';

/**
 * Concrete channel registry that stores adapter factory functions by type id.
 * The PluginManager exposes an adapter factory backed by this registry.
 */
export class ChannelRegistryImpl implements ChannelRegistry {
  private factories = new Map<string, () => ChannelAdapter>();

  addAdapter(id: string, factory: () => ChannelAdapter): void {
    this.factories.set(id, factory);
  }

  /**
   * Create an adapter instance for the given type.
   * Returns null if no factory is registered for the type.
   */
  createAdapter(type: string): ChannelAdapter | null {
    const factory = this.factories.get(type);
    return factory ? factory() : null;
  }

  /** Return all registered adapter type ids. */
  getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Concrete tool registry that collects tool definitions.
 * Typed as unknown until SDK tool types are integrated.
 */
export class ToolRegistryImpl implements ToolRegistry {
  private tools: unknown[] = [];

  addTool(tool: unknown): void {
    this.tools.push(tool);
  }

  /** Return a copy of all registered tools. */
  getTools(): unknown[] {
    return [...this.tools];
  }
}

/**
 * Concrete service registry that stores named background services.
 * Services are started/stopped by PluginManager during lifecycle events.
 */
export class ServiceRegistryImpl implements ServiceRegistry {
  private services = new Map<string, PluginService>();

  addService(id: string, service: PluginService): void {
    this.services.set(id, service);
  }

  /** Return the services map (read-only view). */
  getServices(): ReadonlyMap<string, PluginService> {
    return this.services;
  }
}
