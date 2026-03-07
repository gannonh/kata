/**
 * Slack Channel Adapter
 *
 * Hybrid poll+subscribe adapter for Slack. Polls conversations.history
 * with oldest timestamp tracking for message history, and optionally
 * subscribes via Socket Mode (WebSocket) for slash command events.
 *
 * When an app-level token (xapp-) is provided via configure(), the adapter
 * starts a SocketModeClient to receive slash commands in real time.
 * Without an app-level token, the adapter operates in poll-only mode.
 */

import { WebClient } from '@slack/web-api';
import { SocketModeClient } from '@slack/socket-mode';
import { markdownToSlack } from 'md-to-slack';
import type { ChannelAdapter, ChannelConfig, ChannelMessage, OutboundMessage } from '../types.ts';

/** 1K below Slack's 40K chat.postMessage text limit to leave room for the truncation suffix */
const SLACK_MAX_TEXT_LENGTH = 39_000;

/** Callbacks for persisting polling state across adapter restarts */
export interface PollingStateFns {
  get: (adapterId: string, channelSourceId: string) => string | null;
  set: (adapterId: string, channelSourceId: string, ts: string) => void;
}

/**
 * Slack channel adapter using conversations.history polling with optional
 * Socket Mode subscription for slash commands.
 * Requires configure() before start().
 */
export class SlackChannelAdapter implements ChannelAdapter {
  readonly name = 'Slack';
  readonly type = 'poll' as const;

  private _id = '';
  private client: WebClient | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTimestamps: Map<string, string> = new Map();
  private botUserId: string | null = null;
  private botId: string | null = null;
  private healthy = false;
  private lastErrorMsg: string | null = null;
  private pollingStateFns: PollingStateFns | null = null;
  private appToken: string | null = null;
  private socketClient: SocketModeClient | null = null;
  private socketConnected = false;

  get id(): string {
    return this._id;
  }

  /**
   * Configure the adapter with a Slack bot token and optional polling state persistence.
   * When an app-level token (xapp-) is provided, Socket Mode is enabled for slash commands.
   * Must be called before start().
   */
  configure(token: string, pollingState?: PollingStateFns, appToken?: string): void {
    this.client = new WebClient(token, { retryConfig: { retries: 3 } });
    this.pollingStateFns = pollingState ?? null;
    this.appToken = appToken ?? null;
  }

  async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void> {
    if (!this.client) {
      throw new Error('SlackChannelAdapter.configure() must be called before start()');
    }

    this._id = config.slug;

    // Resolve bot identity to filter self-messages
    let authResult;
    try {
      authResult = await this.client.auth.test();
    } catch (err) {
      throw new Error(`Slack auth.test() failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.botUserId = (authResult.user_id as string) ?? null;
    this.botId = (authResult.bot_id as string) ?? null;

    // Load persisted polling state for each channel
    if (this.pollingStateFns) {
      for (const channelId of config.filter?.channelIds ?? []) {
        const ts = this.pollingStateFns.get(this._id, channelId);
        if (ts) {
          this.lastTimestamps.set(channelId, ts);
        }
      }
    }

    this.healthy = true;

    // Start periodic polling
    const intervalMs = config.pollIntervalMs ?? 10_000;
    this.pollTimer = setInterval(() => this.poll(config, onMessage), intervalMs);

    // Run initial poll immediately
    await this.poll(config, onMessage);

    // Start Socket Mode for slash commands (if app-level token provided)
    if (this.appToken) {
      await this.startSocketMode(onMessage);
    }
  }

  private async startSocketMode(onMessage: (msg: ChannelMessage) => void, retries = 2): Promise<void> {
    this.socketClient = new SocketModeClient({ appToken: this.appToken! });

    this.socketClient.on('slash_commands', async ({ body, ack }: { body: Record<string, string>; ack: (response?: Record<string, string>) => Promise<void> }) => {
      // Acknowledge within 3 seconds (Slack requirement)
      await ack({ text: 'Processing...' });

      // Convert slash command to ChannelMessage
      const command = body.command ?? '';
      const channelMessage: ChannelMessage = {
        id: `cmd-${body.trigger_id ?? 'unknown'}`,
        channelId: this._id,
        source: body.user_id ?? 'unknown',
        timestamp: Date.now(),
        content: body.text ? `${command} ${body.text}` : command,
        metadata: {
          slackChannel: body.channel_id,
          team: body.team_id,
          command: body.command,
          triggerId: body.trigger_id,
          responseUrl: body.response_url,
        },
      };
      onMessage(channelMessage);
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.socketClient.start();
        this.socketConnected = true;
        return;
      } catch (err) {
        this.lastErrorMsg = `Socket Mode start failed: ${err instanceof Error ? err.message : String(err)}`;
        if (attempt < retries) {
          // Exponential backoff: 1s, 2s
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // All retries exhausted - adapter runs in poll-only mode
    this.socketClient = null;
    this.healthy = false;
  }

  private async poll(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void> {
    const channelIds = config.filter?.channelIds ?? [];
    let pollHadError = false;

    for (const channelId of channelIds) {
      try {
        const oldest = this.lastTimestamps.get(channelId);
        const result = await this.client!.conversations.history({
          channel: channelId,
          oldest,
          inclusive: false,
          limit: 100,
        });

        const messages = result.messages ?? [];
        if (messages.length === 0) continue;

        // Track newest timestamp (messages arrive newest-first)
        const newestTs = messages[0]!.ts!;

        // Filter out bot's own messages
        const filtered = messages.filter(
          (msg) => msg.bot_id !== this.botId && msg.user !== this.botUserId,
        );

        // Reverse to process chronologically (oldest first)
        const chronological = [...filtered].reverse();

        for (const msg of chronological) {
          onMessage(this.toChannelMessage(channelId, msg));
        }

        // Update tracking state
        this.lastTimestamps.set(channelId, newestTs);
        if (this.pollingStateFns) {
          this.pollingStateFns.set(this._id, channelId, newestTs);
        }
      } catch (err) {
        pollHadError = true;
        this.healthy = false;
        this.lastErrorMsg = err instanceof Error ? err.message : String(err);
      }
    }

    if (!pollHadError) {
      this.healthy = true;
      this.lastErrorMsg = null;
    }
  }

  private toChannelMessage(
    slackChannelId: string,
    msg: { ts?: string; user?: string; text?: string; thread_ts?: string; team?: string },
  ): ChannelMessage {
    return {
      id: msg.ts!,
      channelId: this._id,
      source: msg.user ?? 'unknown',
      timestamp: parseFloat(msg.ts!) * 1000,
      content: msg.text ?? '',
      metadata: { slackChannel: slackChannelId, team: msg.team },
      replyTo:
        msg.thread_ts && msg.thread_ts !== msg.ts
          ? {
              threadId: msg.thread_ts,
              messageId: msg.ts!,
            }
          : undefined,
    };
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.client) throw new Error('SlackChannelAdapter not configured');

    // Convert standard markdown to Slack mrkdwn
    let text = markdownToSlack(message.content);

    // Truncate if exceeding Slack's text limit
    if (text.length > SLACK_MAX_TEXT_LENGTH) {
      text = text.slice(0, SLACK_MAX_TEXT_LENGTH) + '\n\n... (response truncated)';
    }

    await this.client.chat.postMessage({
      channel: message.channelId,
      text,
      thread_ts: message.threadId,
    });
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.socketClient) {
      await this.socketClient.disconnect();
      this.socketClient = null;
      this.socketConnected = false;
    }
    this.client = null;
    this.appToken = null;
    this.healthy = false;
  }

  isHealthy(): boolean {
    // If socket mode is configured but disconnected, report unhealthy
    if (this.appToken && !this.socketConnected) {
      return false;
    }
    return this.healthy;
  }

  getLastError(): string | null {
    return this.lastErrorMsg;
  }
}
