import { describe, test, expect, afterEach, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { TaskScheduler } from '../task-scheduler.ts';
import type { ScheduledTask, TaskAction } from '../types.ts';

describe('TaskScheduler', () => {
  let db: Database;
  let scheduler: TaskScheduler;
  let firedTasks: ScheduledTask[];

  const testAction: TaskAction = {
    type: 'send_message',
    workspaceId: 'ws-1',
    sessionKey: 'sess-1',
    message: 'hello',
  };

  beforeEach(() => {
    db = new Database(':memory:');
    firedTasks = [];
    scheduler = new TaskScheduler(db, async (task) => {
      firedTasks.push(task);
    });
  });

  afterEach(async () => {
    await scheduler.stop();
    db.close();
  });

  test('addTask creates a cron task with computed nextRunAt', () => {
    const task = scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'cron',
      schedule: '0 9 * * 1-5',
      action: testAction,
    });

    expect(task.id).toBeGreaterThan(0);
    expect(task.type).toBe('cron');
    expect(task.enabled).toBe(true);
    expect(task.lastRunAt).toBeNull();

    const nextRun = new Date(task.nextRunAt);
    expect(nextRun.getTime()).toBeGreaterThan(Date.now());
  });

  test('addTask creates an interval task', () => {
    const before = Date.now();
    const task = scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'interval',
      schedule: '5000',
      action: testAction,
    });

    expect(task.type).toBe('interval');
    const nextRun = new Date(task.nextRunAt).getTime();
    // nextRunAt should be ~5s from now (within 1s tolerance)
    expect(nextRun).toBeGreaterThanOrEqual(before + 4000);
    expect(nextRun).toBeLessThanOrEqual(before + 6000);
  });

  test('addTask creates a one-shot task', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const task = scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'one-shot',
      schedule: futureDate,
      action: testAction,
    });

    expect(task.type).toBe('one-shot');
    expect(task.nextRunAt).toBe(futureDate);
  });

  test('addTask throws for invalid cron expression', () => {
    expect(() =>
      scheduler.addTask({
        workspaceId: 'ws-1',
        type: 'cron',
        schedule: 'not-a-cron',
        action: testAction,
      }),
    ).toThrow();
  });

  test('removeTask deletes task from DB', () => {
    const task = scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'interval',
      schedule: '5000',
      action: testAction,
    });

    scheduler.removeTask(task.id);
    const tasks = scheduler.listTasks();
    expect(tasks).toHaveLength(0);
  });

  test('listTasks filters by workspaceId', () => {
    scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'interval',
      schedule: '5000',
      action: testAction,
    });
    scheduler.addTask({
      workspaceId: 'ws-2',
      type: 'interval',
      schedule: '5000',
      action: { type: 'plugin_action', pluginId: 'p1', action: 'check' },
    });

    const all = scheduler.listTasks();
    expect(all).toHaveLength(2);

    const ws1 = scheduler.listTasks('ws-1');
    expect(ws1).toHaveLength(1);
    expect(ws1[0]!.workspaceId).toBe('ws-1');

    const ws2 = scheduler.listTasks('ws-2');
    expect(ws2).toHaveLength(1);
    expect(ws2[0]!.workspaceId).toBe('ws-2');
  });

  test('start fires catch-up for missed tasks', async () => {
    // Insert a task with nextRunAt in the past
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    db.run(
      `INSERT INTO scheduled_tasks (workspace_id, type, schedule, action, enabled, next_run_at)
       VALUES ('ws-1', 'interval', '60000', '${JSON.stringify(testAction)}', 1, '${pastDate}')`,
    );

    scheduler.start();

    // Wait for catch-up (delay is max(0, past - now) = 0, so fires immediately via setTimeout(fn, 0))
    await new Promise((r) => setTimeout(r, 100));

    expect(firedTasks.length).toBeGreaterThanOrEqual(1);
  });

  test('start schedules future tasks', async () => {
    // Add a task that fires 200ms from now
    const futureDate = new Date(Date.now() + 200).toISOString();
    db.run(
      `INSERT INTO scheduled_tasks (workspace_id, type, schedule, action, enabled, next_run_at)
       VALUES ('ws-1', 'one-shot', '${futureDate}', '${JSON.stringify(testAction)}', 1, '${futureDate}')`,
    );

    scheduler.start();

    // Should not have fired yet
    expect(firedTasks).toHaveLength(0);

    // Wait for the timer to fire (200ms + some tolerance)
    await new Promise((r) => setTimeout(r, 400));

    expect(firedTasks.length).toBeGreaterThanOrEqual(1);
  });

  test('one-shot task is disabled after firing', async () => {
    const futureDate = new Date(Date.now() + 50).toISOString();
    const task = scheduler.addTask({
      workspaceId: 'ws-1',
      type: 'one-shot',
      schedule: futureDate,
      action: testAction,
    });

    scheduler.start();

    // Wait for the task to fire and complete
    await new Promise((r) => setTimeout(r, 200));

    const updated = scheduler.getTask(task.id);
    expect(updated).not.toBeNull();
    expect(updated!.enabled).toBe(false);
  });

  test('stop cancels pending timers', async () => {
    // Schedule a task 5s in the future
    const futureDate = new Date(Date.now() + 5000).toISOString();
    db.run(
      `INSERT INTO scheduled_tasks (workspace_id, type, schedule, action, enabled, next_run_at)
       VALUES ('ws-1', 'one-shot', '${futureDate}', '${JSON.stringify(testAction)}', 1, '${futureDate}')`,
    );

    scheduler.start();
    await scheduler.stop();

    // Wait a bit and verify the callback never fires
    await new Promise((r) => setTimeout(r, 100));
    expect(firedTasks).toHaveLength(0);
  });
});
