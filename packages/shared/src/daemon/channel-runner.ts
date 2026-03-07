/**
 * Channel Runner
 *
 * Orchestrates the lifecycle of channel adapters within the daemon process.
 * Creates adapters from config, applies trigger filtering, resolves session keys,
 * and enqueues inbound messages into the MessageQueue.
 */

import type { ChannelAdapter, ChannelConfig, ChannelMessage, OutboundMessage } from '../channels/types.ts';
import { TriggerMatcher } from '../channels/trigger-matcher.ts';
import { resolveSessionKey } from '../channels/session-resolver.ts';
import { createAdapter as defaultCreateAdapter } from '../channels/adapters/index.ts';
import type { SlackChannelAdapter } from '../channels/adapters/slack-adapter.ts';
import type { WhatsAppChannelAdapter } from '../channels/adapters/whatsapp-adapter.ts';
import type { MessageQueue } from './message-queue.ts';
import type { DaemonEvent } from './types.ts';

/** Patterns that trigger a conversation reset (new session key) */
const RESET_PATTERNS = [
  /^\/reset$/i,
  /^\/new$/i,
  /^reset\s+conversation$/i,
  /^start\s+over$/i,
];

function isResetCommand(content: string): boolean {
  const trimmed = content.trim();
  return RESET_PATTERNS.some(p => p.test(trimmed));
}

/** Factory function that creates an adapter instance for a given type identifier */
export type AdapterFactory = (type: string) => ChannelAdapter | null;

interface WorkspaceChannelConfig {
  workspaceId: string;
  configs: ChannelConfig[];
  tokens: Map<string, string>;
}

interface RunningAdapter {
  adapter: ChannelAdapter;
  workspaceId: string;
  config: ChannelConfig;
}

/**
 * Manages the lifecycle of channel adapters within the daemon process.
 * Handles adapter creation, trigger filtering, session resolution, and message enqueuing.
 */
export class ChannelRunner {
  private adapters: Map<string, RunningAdapter> = new Map();
  private triggerMatchers: Map<string, TriggerMatcher> = new Map();
  private resetCounters: Map<string, number> = new Map();
  private adapterFactory: AdapterFactory;

  constructor(
    private queue: MessageQueue,
    private emit: (event: DaemonEvent) => void,
    private workspaceConfigs: Map<string, WorkspaceChannelConfig>,
    private log: (msg: string) => void = () => {},
    adapterFactory?: AdapterFactory,
  ) {
    this.adapterFactory = adapterFactory ?? defaultCreateAdapter;
  }

  async startAll(): Promise<void> {
    let startedCount = 0;

    for (const [, wsConfig] of this.workspaceConfigs) {
      for (const config of wsConfig.configs) {
        if (!config.enabled) continue;

        const adapter = this.adapterFactory(config.adapter);
        if (!adapter) {
          this.emit({
            type: 'plugin_error',
            pluginId: config.adapter,
            error: `Unknown adapter type: ${config.adapter}`,
          });
          continue;
        }

        // Configure adapter based on type
        // Resolve credential key: prefer channelSlug (dedicated), fall back to sourceSlug (legacy)
        const credKey = config.credentials.channelSlug ?? config.credentials.sourceSlug;

        switch (config.adapter) {
          case 'slack': {
            if (!credKey) {
              this.emit({ type: 'plugin_error', pluginId: config.slug, error: 'No credential key configured' });
              continue;
            }
            const token = wsConfig.tokens.get(credKey);
            if (!token) {
              this.emit({
                type: 'plugin_error',
                pluginId: config.slug,
                error: `No token found for credential key: ${credKey}`,
              });
              continue;
            }
            const appToken = config.credentials.appTokenSlug
              ? wsConfig.tokens.get(config.credentials.appTokenSlug) ?? undefined
              : undefined;
            (adapter as SlackChannelAdapter).configure(
              token,
              {
                get: (aid, cid) => this.queue.getPollingState(aid, cid),
                set: (aid, cid, ts) => this.queue.setPollingState(aid, cid, ts),
              },
              appToken,
            );
            break;
          }
          case 'whatsapp': {
            if (!credKey) {
              this.emit({ type: 'plugin_error', pluginId: config.slug, error: 'No credential key configured' });
              continue;
            }
            const authStatePath = wsConfig.tokens.get(credKey);
            if (!authStatePath) {
              this.emit({
                type: 'plugin_error',
                pluginId: config.slug,
                error: `No auth state path found for credential key: ${credKey}`,
              });
              continue;
            }
            (adapter as WhatsAppChannelAdapter).configure(authStatePath);
            break;
          }
        }

        // Create trigger matcher for this adapter
        const matcher = new TriggerMatcher(config.filter?.triggerPatterns ?? []);
        this.triggerMatchers.set(config.slug, matcher);

        try {
          await adapter.start(config, (msg) =>
            this.handleMessage(config.slug, wsConfig.workspaceId, msg),
          );
          this.adapters.set(config.slug, {
            adapter,
            workspaceId: wsConfig.workspaceId,
            config,
          });
          startedCount++;
          this.log(`Started adapter: ${config.slug} (${config.adapter})`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.log(`Failed to start adapter ${config.slug}: ${errorMsg}`);
          this.emit({
            type: 'plugin_error',
            pluginId: config.slug,
            error: errorMsg,
          });
        }
      }
    }

    this.log(`Started ${startedCount} adapter(s)`);
  }

  private handleMessage(slug: string, workspaceId: string, msg: ChannelMessage): void {
    // Check trigger filter
    const matcher = this.triggerMatchers.get(slug);
    if (matcher && !matcher.matches(msg.content)) {
      this.log(`Message ${msg.id} skipped by trigger filter for ${slug}`);
      return;
    }

    const channelSourceId = msg.channelId;
    const threadKey = msg.replyTo?.threadId ?? channelSourceId;

    // Detect conversation reset
    if (isResetCommand(msg.content)) {
      const baseKey = `${slug}:${workspaceId}:${threadKey}`;
      const count = (this.resetCounters.get(baseKey) ?? 0) + 1;
      this.resetCounters.set(baseKey, count);
      this.log(`Reset command detected for ${slug}, counter=${count}`);
      return; // Do not enqueue the reset keyword itself
    }

    // Resolve session key (with reset counter for fresh sessions after reset)
    const resetCount = this.resetCounters.get(`${slug}:${workspaceId}:${threadKey}`) ?? 0;
    const sessionKey = resolveSessionKey(slug, workspaceId, msg.replyTo?.threadId, channelSourceId, resetCount);
    msg.metadata.sessionKey = sessionKey;
    msg.metadata.workspaceId = workspaceId;

    // Enqueue the message
    this.queue.enqueue('inbound', slug, msg);

    // Emit event
    this.emit({ type: 'message_received', channelId: slug, messageId: msg.id });
  }

  /**
   * Deliver an outbound message through the adapter identified by slug.
   * Throws if the adapter is not running or does not implement send().
   */
  async deliverOutbound(channelSlug: string, message: OutboundMessage): Promise<void> {
    const running = this.adapters.get(channelSlug);
    if (!running) {
      throw new Error(`No running adapter for channel: ${channelSlug}`);
    }
    if (!running.adapter.send) {
      throw new Error(`Adapter ${channelSlug} does not support send()`);
    }
    await running.adapter.send(message);
    this.log(`Delivered outbound message to ${channelSlug}`);
  }

  async stopAll(): Promise<void> {
    for (const [slug, { adapter }] of this.adapters) {
      try {
        await adapter.stop();
        this.log(`Stopped adapter: ${slug}`);
      } catch (err) {
        this.log(`Error stopping adapter ${slug}: ${err}`);
      }
    }
    this.adapters.clear();
    this.triggerMatchers.clear();
    this.resetCounters.clear();
  }
}
