/**
 * Daemon Entry Point
 *
 * Standalone script executed as a Bun subprocess by the Electron main process.
 * Reads DaemonCommand objects from stdin (JSON-lines), emits DaemonEvent objects
 * to stdout (JSON-lines), and logs to stderr.
 *
 * This file is NOT exported from the barrel. It runs as its own process.
 */

import { join } from 'path';
import { homedir } from 'os';
import type { DaemonCommand, DaemonEvent, QueuedMessage } from './types.ts';
import type { ChannelConfig, OutboundMessage } from '../channels/types.ts';
import { createLineParser, formatMessage } from './ipc.ts';
import { writePidFile, removePidFile } from './pid.ts';
import { MessageQueue } from './message-queue.ts';
import { ChannelRunner } from './channel-runner.ts';
import { PluginManager } from '../plugins/plugin-manager.ts';
import { TaskScheduler } from './task-scheduler.ts';

function log(msg: string): void {
  process.stderr.write(`[daemon] ${msg}\n`);
}

function emit(event: DaemonEvent): void {
  process.stdout.write(formatMessage(event));
}

async function main(): Promise<void> {
  const configDir = process.env.KATA_CONFIG_DIR || join(homedir(), '.kata-agents');

  writePidFile(configDir, process.pid);
  log(`Starting (pid=${process.pid}, configDir=${configDir})`);

  emit({ type: 'status_changed', status: 'starting' });

  const dbPath = join(configDir, 'daemon.db');
  const queue = new MessageQueue(dbPath);
  log(`MessageQueue initialized at ${dbPath}`);

  const scheduler = new TaskScheduler(queue.getDb(), async (task) => {
    log(`Task ${task.id} fired (${task.type}): ${JSON.stringify(task.action)}`);
    emit({ type: 'task_fired', taskId: task.id, workspaceId: task.workspaceId });
  }, log);
  scheduler.start();
  log('TaskScheduler started');

  // Recovery: reset any messages left in 'processing' state from a previous crash
  queue.getDb().run("UPDATE messages SET status = 'pending' WHERE status = 'processing'");
  log('Reset stale processing messages to pending');

  // Concurrency control for message processing
  const MAX_CONCURRENT = 3;
  let activeProcessing = 0;

  function emitProcessMessage(msg: QueuedMessage): void {
    activeProcessing++;
    const payload = msg.payload as { content: string; metadata: Record<string, unknown> };
    emit({
      type: 'process_message',
      messageId: msg.id,
      channelId: msg.channelId,
      workspaceId: (payload.metadata?.workspaceId as string) ?? '',
      sessionKey: (payload.metadata?.sessionKey as string) ?? '',
      content: payload.content ?? '',
      metadata: payload.metadata ?? {},
    });
  }

  const state = {
    channelRunner: null as ChannelRunner | null,
    pluginManager: null as PluginManager | null,
  };

  emit({ type: 'status_changed', status: 'running' });

  const CONSUMER_INTERVAL_MS = 1000;
  const MAX_CONSECUTIVE_ERRORS = 5;
  let consecutiveErrors = 0;
  const consumerTimer = setInterval(() => {
    try {
      while (activeProcessing < MAX_CONCURRENT) {
        const msg = queue.dequeue('inbound');
        if (!msg) break;
        emitProcessMessage(msg);
      }
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      log(`Consumer loop error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err instanceof Error ? err.message : String(err)}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log('Consumer loop hit max consecutive errors, emitting error status');
        emit({ type: 'status_changed', status: 'error', error: `Consumer loop failed ${MAX_CONSECUTIVE_ERRORS} times consecutively` });
      }
    }
  }, CONSUMER_INTERVAL_MS);

  // Read commands from stdin as JSON-lines
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let running = true;

  const pendingCommands: DaemonCommand[] = [];

  const parser = createLineParser((line: string) => {
    try {
      pendingCommands.push(JSON.parse(line) as DaemonCommand);
    } catch {
      log(`Failed to parse command: ${line}`);
    }
  });

  async function handleCommand(cmd: DaemonCommand): Promise<void> {
    try {
      switch (cmd.type) {
        case 'stop':
          log('Received stop command');
          running = false;
          break;
        case 'health_check':
          emit({ type: 'status_changed', status: 'running' });
          break;
        case 'start':
          // No-op: already running
          break;
        case 'plugin_action':
          log(`Plugin action: ${cmd.pluginId}/${cmd.action}`);
          // TODO: route to specific plugin via PluginManager
          break;
        case 'configure_channels': {
          log(`Configuring channels for ${cmd.workspaces.length} workspace(s)`);
          // Stop existing runner and plugins if any
          if (state.channelRunner) {
            await state.channelRunner.stopAll();
            state.channelRunner = null;
          }
          if (state.pluginManager) {
            await state.pluginManager.shutdownAll();
            state.pluginManager = null;
          }
          const enabledPluginIds = new Set(
            cmd.workspaces.flatMap((ws) => ws.enabledPlugins),
          );
          state.pluginManager = new PluginManager([...enabledPluginIds], log);
          state.pluginManager.loadBuiltinPlugins();
          log(`PluginManager loaded with ${enabledPluginIds.size} enabled plugin(s)`);
          // The daemon serves all workspaces so there is no single workspace root.
          // Passing configDir (~/.kata-agents/) as workspaceRootPath; plugins that
          // need per-workspace paths should not rely on this value.
          try {
            await state.pluginManager.initializeAll({
              workspaceRootPath: configDir,
              getCredential: async () => null,
              logger: {
                info: (msg: string) => log(`[plugin] ${msg}`),
                warn: (msg: string) => log(`[plugin:warn] ${msg}`),
                error: (msg: string) => log(`[plugin:error] ${msg}`),
                debug: (msg: string) => log(`[plugin:debug] ${msg}`),
              },
            });
            log('PluginManager initialized');
          } catch (err) {
            log(`[ERROR] Plugin initialization failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          // Build workspace configs map
          const workspaceConfigs = new Map<
            string,
            { workspaceId: string; configs: ChannelConfig[]; tokens: Map<string, string> }
          >();
          for (const ws of cmd.workspaces) {
            workspaceConfigs.set(ws.workspaceId, {
              workspaceId: ws.workspaceId,
              configs: ws.configs as ChannelConfig[],
              tokens: new Map(Object.entries(ws.tokens)),
            });
          }
          state.channelRunner = new ChannelRunner(
            queue, emit, workspaceConfigs, log,
            state.pluginManager.getAdapterFactory(),
          );
          await state.channelRunner.startAll();
          break;
        }
        case 'schedule_task': {
          const task = scheduler.addTask({
            workspaceId: cmd.workspaceId,
            type: cmd.taskType,
            schedule: cmd.schedule,
            action: cmd.action,
          });
          log(`Scheduled task ${task.id} (${task.type}): next at ${task.nextRunAt}`);
          break;
        }
        case 'message_processed': {
          activeProcessing = Math.max(0, activeProcessing - 1);

          if (!cmd.success) {
            queue.markFailed(cmd.messageId, cmd.error);
            log(`Message ${cmd.messageId} processing failed: ${cmd.error}`);
            break;
          }

          queue.markProcessed(cmd.messageId);
          log(`Message ${cmd.messageId} processed successfully`);

          if (!cmd.response || !state.channelRunner) break;

          const originalRow = queue.getDb().query(
            'SELECT channel_id, payload FROM messages WHERE id = $id',
          ).get({ $id: cmd.messageId }) as { channel_id: string; payload: string } | null;

          if (!originalRow) break;

          const originalPayload = JSON.parse(originalRow.payload) as {
            metadata?: Record<string, unknown>;
            replyTo?: { threadId?: string };
          };
          const outboundChannelId = (
            originalPayload.metadata?.slackChannel ??
            originalPayload.metadata?.jid ??
            ''
          ) as string;
          const outboundMsg: OutboundMessage = {
            channelId: outboundChannelId,
            content: cmd.response,
            threadId: originalPayload.replyTo?.threadId,
          };

          const outboundId = queue.enqueue('outbound', originalRow.channel_id, outboundMsg);
          state.channelRunner.deliverOutbound(originalRow.channel_id, outboundMsg)
            .then(() => {
              queue.markProcessed(outboundId);
              emit({ type: 'message_sent', channelId: originalRow.channel_id, messageId: String(outboundId) });
            })
            .catch((err: unknown) => {
              queue.markFailed(outboundId, err instanceof Error ? err.message : String(err));
              log(`Outbound delivery failed for message ${outboundId}: ${err}`);
            });

          break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log(`Error handling command ${cmd.type}: ${errorMsg}`);
      emit({ type: 'plugin_error', pluginId: cmd.type, error: errorMsg });
    }
  }

  while (running) {
    const { value, done } = await reader.read();
    if (done) {
      log('stdin closed (parent exited)');
      break;
    }
    parser(decoder.decode(value, { stream: true }));

    while (pendingCommands.length > 0) {
      const cmd = pendingCommands.shift()!;
      await handleCommand(cmd);
    }
  }

  // Graceful shutdown
  emit({ type: 'status_changed', status: 'stopping' });
  clearInterval(consumerTimer);
  log('Consumer timer stopped');
  await scheduler.stop();
  log('TaskScheduler stopped');
  if (state.pluginManager) {
    await state.pluginManager.shutdownAll();
    log('PluginManager shut down');
  }
  if (state.channelRunner) {
    await state.channelRunner.stopAll();
  }
  queue.close();
  log('MessageQueue closed');
  removePidFile(configDir);
  emit({ type: 'status_changed', status: 'stopped' });
  log('Shutdown complete');
}

main().catch((err) => {
  process.stderr.write(`[daemon] Fatal error: ${err}\n`);
  process.exit(1);
});
