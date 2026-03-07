import { describe, expect, test } from 'bun:test';
import { PluginManager } from '../plugin-manager.ts';
import { SlackChannelAdapter } from '../../channels/adapters/slack-adapter.ts';
import { WhatsAppChannelAdapter } from '../../channels/adapters/whatsapp-adapter.ts';
import type { PluginContext } from '../types.ts';

describe('PluginManager', () => {
  test('loadBuiltinPlugins registers both builtin plugins', () => {
    const manager = new PluginManager(['kata-slack', 'kata-whatsapp']);
    manager.loadBuiltinPlugins();

    const plugins = manager.getRegisteredPlugins();
    expect(plugins).toHaveLength(2);
    expect(plugins.find((p) => p.id === 'kata-slack')).toEqual({
      id: 'kata-slack',
      name: 'Slack',
      version: '0.7.0',
      enabled: true,
    });
    expect(plugins.find((p) => p.id === 'kata-whatsapp')).toEqual({
      id: 'kata-whatsapp',
      name: 'WhatsApp',
      version: '0.7.0',
      enabled: true,
    });
  });

  test('disabled plugins are tracked but not registered', () => {
    const manager = new PluginManager([]);
    manager.loadBuiltinPlugins();

    const plugins = manager.getRegisteredPlugins();
    expect(plugins).toHaveLength(2);
    expect(plugins.every((p) => p.enabled === false)).toBe(true);

    const factory = manager.getAdapterFactory();
    expect(factory('slack')).toBeNull();
    expect(factory('whatsapp')).toBeNull();
  });

  test('getAdapterFactory returns adapter for enabled plugin', () => {
    const manager = new PluginManager(['kata-slack']);
    manager.loadBuiltinPlugins();

    const factory = manager.getAdapterFactory();
    const adapter = factory('slack');
    expect(adapter).toBeInstanceOf(SlackChannelAdapter);
  });

  test('getAdapterFactory returns null for unknown type', () => {
    const manager = new PluginManager(['kata-slack', 'kata-whatsapp']);
    manager.loadBuiltinPlugins();

    const factory = manager.getAdapterFactory();
    expect(factory('unknown')).toBeNull();
  });

  test('selectively enables plugins', () => {
    const manager = new PluginManager(['kata-slack']);
    manager.loadBuiltinPlugins();

    const factory = manager.getAdapterFactory();
    expect(factory('slack')).toBeInstanceOf(SlackChannelAdapter);
    expect(factory('whatsapp')).toBeNull();

    const plugins = manager.getRegisteredPlugins();
    expect(plugins.find((p) => p.id === 'kata-slack')!.enabled).toBe(true);
    expect(plugins.find((p) => p.id === 'kata-whatsapp')!.enabled).toBe(false);
  });

  test('initializeAll is idempotent', async () => {
    const manager = new PluginManager(['kata-slack']);
    manager.loadBuiltinPlugins();

    const context: PluginContext = {
      workspaceRootPath: '/tmp/test',
      getCredential: async () => null,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    };

    // Should not throw (builtin plugins have no initialize method)
    await manager.initializeAll(context);

    // Verify idempotent (calling again is a no-op)
    await manager.initializeAll(context);
  });

  test('shutdownAll calls shutdown on enabled plugins', async () => {
    const manager = new PluginManager(['kata-slack', 'kata-whatsapp']);
    manager.loadBuiltinPlugins();

    const context: PluginContext = {
      workspaceRootPath: '/tmp/test',
      getCredential: async () => null,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    };

    await manager.initializeAll(context);
    // Should not throw (builtin plugins have no shutdown method)
    await manager.shutdownAll();
  });

  test('whatsapp adapter factory produces WhatsAppChannelAdapter', () => {
    const manager = new PluginManager(['kata-whatsapp']);
    manager.loadBuiltinPlugins();

    const factory = manager.getAdapterFactory();
    const adapter = factory('whatsapp');
    expect(adapter).toBeInstanceOf(WhatsAppChannelAdapter);
  });
});
