/**
 * Entry Integration Tests
 *
 * Verifies the wiring between PluginManager, TaskScheduler, ChannelRunner,
 * and MessageQueue as composed in the daemon entry point.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { PluginManager } from '../../plugins/plugin-manager.ts';
import { TaskScheduler } from '../task-scheduler.ts';
import { MessageQueue } from '../message-queue.ts';
import { ChannelRunner } from '../channel-runner.ts';
import type { ChannelConfig, ChannelAdapter, ChannelMessage } from '../../channels/types.ts';
import type { DaemonEvent } from '../types.ts';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

describe('Daemon entry integration', () => {
  const tempDirs: string[] = [];
  const databasesToClose: Database[] = [];

  afterEach(async () => {
    for (const db of databasesToClose) {
      try { db.close(); } catch { /* already closed */ }
    }
    databasesToClose.length = 0;
    for (const dir of tempDirs) {
      try { rmSync(dir, { recursive: true }); } catch { /* best effort */ }
    }
    tempDirs.length = 0;
  });

  test('PluginManager adapter factory works with ChannelRunner', async () => {
    const pm = new PluginManager(['kata-slack']);
    pm.loadBuiltinPlugins();

    const factory = pm.getAdapterFactory();
    const events: DaemonEvent[] = [];
    const emit = (e: DaemonEvent) => events.push(e);

    // Verify the factory produces a non-null adapter for 'slack'
    const slackAdapter = factory('slack');
    expect(slackAdapter).not.toBeNull();
    expect(slackAdapter!.name).toBe('Slack');

    // Verify a ChannelRunner can accept the factory (constructor wiring)
    const wsConfigs = new Map<
      string,
      { workspaceId: string; configs: ChannelConfig[]; tokens: Map<string, string> }
    >();
    const runner = new ChannelRunner(
      { enqueue: () => 1, getPollingState: () => null, setPollingState: () => {} } as unknown as MessageQueue,
      emit,
      wsConfigs,
      () => {},
      factory,
    );
    // No configs, so startAll should be a no-op
    await runner.startAll();
    await runner.stopAll();
  });

  test('TaskScheduler shares Database with MessageQueue', () => {
    const dir = mkdtempSync(join(tmpdir(), 'daemon-integration-'));
    tempDirs.push(dir);

    const queue = new MessageQueue(join(dir, 'test.db'));
    const db = queue.getDb();
    databasesToClose.push(db);

    const firedTasks: unknown[] = [];
    const scheduler = new TaskScheduler(db, async (task) => {
      firedTasks.push(task);
    });

    // Verify task can be added using the shared DB
    const task = scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'interval',
      schedule: '60000',
      action: { type: 'send_message', workspaceId: 'ws-1', sessionKey: 'sk-1', message: 'hello' },
    });

    expect(task.id).toBeGreaterThan(0);
    expect(task.type).toBe('interval');

    // Verify the task is persisted in the same DB
    const row = db.query('SELECT * FROM scheduled_tasks WHERE id = ?').get(task.id) as { id: number } | null;
    expect(row).not.toBeNull();
    expect(row!.id).toBe(task.id);

    // Also verify queue tables exist in the same DB
    const msgRow = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get() as { name: string } | null;
    expect(msgRow).not.toBeNull();

    queue.close();
  });

  test('enabledPlugins filtering controls adapter availability', () => {
    // Only enable kata-slack
    const pm = new PluginManager(['kata-slack']);
    pm.loadBuiltinPlugins();

    const factory = pm.getAdapterFactory();

    // Slack should produce an adapter
    const slackAdapter = factory('slack');
    expect(slackAdapter).not.toBeNull();

    // WhatsApp should NOT produce an adapter (not in enabled set)
    const whatsappAdapter = factory('whatsapp');
    expect(whatsappAdapter).toBeNull();
  });

  test('enabledPlugins with all plugins enabled', () => {
    const pm = new PluginManager(['kata-slack', 'kata-whatsapp']);
    pm.loadBuiltinPlugins();

    const factory = pm.getAdapterFactory();

    expect(factory('slack')).not.toBeNull();
    expect(factory('whatsapp')).not.toBeNull();
    // Unknown type still returns null
    expect(factory('discord')).toBeNull();
  });

  test('PluginManager shutdownAll is safe to call multiple times', async () => {
    const pm = new PluginManager(['kata-slack']);
    pm.loadBuiltinPlugins();

    await pm.shutdownAll();
    // Second call should not throw
    await pm.shutdownAll();
  });
});
