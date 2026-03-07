/**
 * Channel Adapter Registry
 *
 * Factory function for creating adapter instances by type identifier.
 */

import type { ChannelAdapter } from '../types.ts';
import { SlackChannelAdapter } from './slack-adapter.ts';
import { WhatsAppChannelAdapter } from './whatsapp-adapter.ts';

export { SlackChannelAdapter } from './slack-adapter.ts';
export type { PollingStateFns } from './slack-adapter.ts';
export { WhatsAppChannelAdapter } from './whatsapp-adapter.ts';
export type { QrCallback } from './whatsapp-adapter.ts';

/**
 * Create a new adapter instance for the given type.
 * Returns null for unknown adapter types.
 */
export function createAdapter(type: string): ChannelAdapter | null {
  switch (type) {
    case 'slack':
      return new SlackChannelAdapter();
    case 'whatsapp':
      return new WhatsAppChannelAdapter();
    default:
      return null;
  }
}
