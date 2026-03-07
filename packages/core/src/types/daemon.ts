/**
 * Daemon Types
 *
 * Types for the always-on daemon process that runs channel adapters and plugins.
 * Used for IPC communication between the Electron main process and the daemon subprocess.
 */

/**
 * Lifecycle status of the daemon process.
 */
export type DaemonStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Type of scheduled task.
 * - `cron`: Fires on a cron schedule (e.g., "0 9 * * 1-5")
 * - `interval`: Fires every N milliseconds
 * - `one-shot`: Fires once at a specific datetime, then marked complete
 */
export type TaskType = 'cron' | 'interval' | 'one-shot';

/**
 * Actions a scheduled task can trigger.
 * Discriminated union on `type`.
 */
export type TaskAction =
  | { type: 'send_message'; workspaceId: string; sessionKey: string; message: string }
  | { type: 'plugin_action'; pluginId: string; action: string; payload?: unknown };

/**
 * Commands sent from the Electron main process to the daemon.
 * Discriminated union on the `type` field.
 */
export type DaemonCommand =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'health_check' }
  | {
      type: 'plugin_action';
      /** Target plugin identifier */
      pluginId: string;
      /** Action name within the plugin */
      action: string;
      /** Optional action payload */
      payload?: unknown;
    }
  | {
      type: 'configure_channels';
      /** Channel configurations grouped by workspace */
      workspaces: Array<{
        workspaceId: string;
        /** ChannelConfig objects (typed as unknown[] to avoid circular dependency) */
        configs: unknown[];
        /** Map of sourceSlug -> token for credential resolution */
        tokens: Record<string, string>;
        /** Plugin IDs enabled for this workspace */
        enabledPlugins: string[];
      }>;
    }
  | {
      type: 'schedule_task';
      workspaceId: string;
      taskType: TaskType;
      schedule: string;
      action: TaskAction;
    }
  | {
      type: 'message_processed';
      /** Queue row ID of the processed message */
      messageId: number;
      /** Agent response text */
      response: string;
      /** Processing succeeded */
      success: true;
    }
  | {
      type: 'message_processed';
      /** Queue row ID of the processed message */
      messageId: number;
      /** Empty response on failure */
      response: string;
      /** Processing failed */
      success: false;
      /** Error description */
      error: string;
    };

/**
 * Events emitted by the daemon to the Electron main process.
 * Discriminated union on the `type` field.
 */
export type DaemonEvent =
  | {
      type: 'status_changed';
      /** New daemon status */
      status: DaemonStatus;
      /** Error message when status is 'error' */
      error?: string;
    }
  | {
      type: 'message_received';
      /** Channel that received the message */
      channelId: string;
      /** ID of the received message */
      messageId: string;
    }
  | {
      type: 'message_sent';
      /** Channel the message was sent through */
      channelId: string;
      /** ID of the sent message */
      messageId: string;
    }
  | {
      type: 'plugin_loaded';
      /** Plugin that was loaded */
      pluginId: string;
    }
  | {
      type: 'plugin_error';
      /** Plugin that encountered an error */
      pluginId: string;
      /** Error description */
      error: string;
    }
  | {
      type: 'task_fired';
      /** ID of the task that fired */
      taskId: number;
      /** Workspace the task belongs to */
      workspaceId: string;
    }
  | {
      type: 'channel_health';
      /** Channel adapter slug */
      channelId: string;
      /** Whether the adapter is currently healthy */
      healthy: boolean;
      /** Error message if unhealthy, null if healthy */
      error: string | null;
    }
  | {
      type: 'process_message';
      /** Queue row ID of the message to process */
      messageId: number;
      /** Channel adapter slug that received the message */
      channelId: string;
      /** Workspace the message belongs to */
      workspaceId: string;
      /** Resolved session key for routing */
      sessionKey: string;
      /** Message body text */
      content: string;
      /** Adapter-specific metadata */
      metadata: Record<string, unknown>;
    };
