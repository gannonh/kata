/**
 * Channels Module
 *
 * Public exports for channel adapters and shared channel infrastructure.
 */

export type {
  ChannelAdapter,
  ChannelMessage,
  ChannelFilter,
  ChannelConfig,
  OutboundMessage,
} from './types.ts';

export { TriggerMatcher } from './trigger-matcher.ts';
export { resolveSessionKey } from './session-resolver.ts';
export { SlackChannelAdapter, WhatsAppChannelAdapter, createAdapter } from './adapters/index.ts';
export type { PollingStateFns, QrCallback } from './adapters/index.ts';
