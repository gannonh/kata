/**
 * Slack Plugin
 *
 * First-party plugin that registers the Slack channel adapter.
 * Wraps the existing SlackChannelAdapter as a factory in the plugin system.
 */

import type { KataPlugin, ChannelRegistry } from '../types.ts';
import { SlackChannelAdapter } from '../../channels/adapters/slack-adapter.ts';

export const slackPlugin: KataPlugin = {
  id: 'kata-slack',
  name: 'Slack',
  version: '0.7.0',
  registerChannels(registry: ChannelRegistry): void {
    registry.addAdapter('slack', () => new SlackChannelAdapter());
  },
};
