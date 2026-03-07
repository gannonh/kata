/**
 * WhatsApp Plugin
 *
 * First-party plugin that registers the WhatsApp channel adapter.
 * Wraps the existing WhatsAppChannelAdapter as a factory in the plugin system.
 */

import type { KataPlugin, ChannelRegistry } from '../types.ts';
import { WhatsAppChannelAdapter } from '../../channels/adapters/whatsapp-adapter.ts';

export const whatsappPlugin: KataPlugin = {
  id: 'kata-whatsapp',
  name: 'WhatsApp',
  version: '0.7.0',
  registerChannels(registry: ChannelRegistry): void {
    registry.addAdapter('whatsapp', () => new WhatsAppChannelAdapter());
  },
};
