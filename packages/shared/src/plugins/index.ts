/**
 * Plugins Module
 *
 * Public exports for the plugin system: types, registries, manager, and builtins.
 */

export type {
  KataPlugin,
  ChannelRegistry,
  ToolRegistry,
  ServiceRegistry,
  PluginService,
  PluginContext,
  PluginLogger,
} from './types.ts';

export { PluginManager } from './plugin-manager.ts';
export { ChannelRegistryImpl, ToolRegistryImpl, ServiceRegistryImpl } from './registry-impl.ts';
export { getBuiltinPlugins } from './builtin/index.ts';
