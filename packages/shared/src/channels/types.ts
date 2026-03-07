/**
 * Channel Types
 *
 * Channels are ingress adapters that bring external messages into the daemon.
 * Each channel adapter implements either a poll-based or subscription-based
 * ingress pattern for a specific communication platform (Slack, email, webhook, etc.).
 */

/**
 * Adapter that connects an external communication platform to the daemon.
 * Implementations handle the transport-specific details of receiving messages.
 *
 * - `poll` adapters fetch messages on an interval (e.g., email via IMAP).
 * - `subscribe` adapters hold a persistent connection (e.g., Slack WebSocket).
 */
export interface ChannelAdapter {
  /** Unique identifier for this adapter instance */
  readonly id: string;

  /** Human-readable name (e.g., "Slack", "Gmail") */
  readonly name: string;

  /** Ingress mode: poll fetches on interval, subscribe holds a persistent connection */
  readonly type: 'poll' | 'subscribe';

  /**
   * Start the adapter. For poll adapters this begins the polling loop;
   * for subscribe adapters this opens the persistent connection.
   */
  start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void>;

  /** Stop the adapter and release all resources */
  stop(): Promise<void>;

  /** Whether the adapter is operating normally */
  isHealthy(): boolean;

  /** Most recent error message, or null if healthy */
  getLastError(): string | null;

  /** Send an outbound message through this adapter (optional) */
  send?(message: OutboundMessage): Promise<void>;
}

/**
 * A message received from an external channel.
 * Normalized into a common shape regardless of source platform.
 */
export interface ChannelMessage {
  /** Unique message identifier (platform-specific format) */
  id: string;

  /** Channel adapter that produced this message */
  channelId: string;

  /** Originating user or system identifier */
  source: string;

  /** Unix timestamp in milliseconds when the message was created */
  timestamp: number;

  /** Message body text */
  content: string;

  /** Adapter-specific metadata (e.g., Slack thread_ts, email headers) */
  metadata: Record<string, unknown>;

  /** Thread context for threaded conversations */
  replyTo?: {
    /** Thread identifier */
    threadId: string;
    /** Parent message identifier */
    messageId: string;
  };
}

/**
 * Filter criteria for selecting which messages a channel should process.
 * All specified fields must match (AND semantics).
 */
export interface ChannelFilter {
  /** Regex patterns that message content must match to be processed */
  triggerPatterns?: string[];

  /** Restrict to messages from specific channel IDs within the platform */
  channelIds?: string[];
}

/**
 * Configuration for a channel adapter instance.
 * Stored per-workspace at ~/.kata-agents/workspaces/{id}/channels/{slug}/config.json
 */
export interface ChannelConfig {
  /** URL-safe identifier for this channel instance */
  slug: string;

  /** Whether this channel is active */
  enabled: boolean;

  /** Adapter type identifier (e.g., "slack", "gmail", "webhook") */
  adapter: string;

  /** Polling interval in milliseconds (only used by poll-type adapters) */
  pollIntervalMs?: number;

  /** Credential reference for this channel */
  credentials: {
    /** Source slug whose credentials this channel uses (legacy path) */
    sourceSlug?: string;
    /** Channel slug for dedicated channel credentials (preferred path) */
    channelSlug?: string;
    /** Slug for app-level token credential (xapp-), required for Socket Mode (slash commands) */
    appTokenSlug?: string;
  };

  /** Optional filter to restrict which messages are processed */
  filter?: ChannelFilter;
}

/**
 * A message to be sent through a channel adapter.
 */
export interface OutboundMessage {
  /** Target channel identifier within the platform (e.g., Slack channel ID, WhatsApp JID) */
  channelId: string;

  /** Message body text */
  content: string;

  /** Thread identifier for threaded replies */
  threadId?: string;

  /** Adapter-specific metadata */
  metadata?: Record<string, unknown>;
}
