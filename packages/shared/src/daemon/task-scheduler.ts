/**
 * Task Scheduler
 *
 * Persists cron, interval, and one-shot tasks in SQLite (shared with MessageQueue)
 * and executes them using croner-based timer scheduling. Survives daemon restarts
 * by reloading tasks from the database on start().
 */

import type { Database } from 'bun:sqlite';
import { Cron } from 'croner';
import type { ScheduledTask, TaskAction, TaskType } from './types.ts';

/** Raw row shape from SQLite before camelCase mapping */
interface RawTaskRow {
  id: number;
  workspace_id: string;
  type: string;
  schedule: string;
  action: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
}

/**
 * Compute the next run time for a task based on its type and schedule.
 */
function computeNextRunAt(type: TaskType, schedule: string): string {
  switch (type) {
    case 'cron': {
      const next = new Cron(schedule).nextRun();
      if (!next) throw new Error(`Cron expression "${schedule}" has no future runs`);
      return next.toISOString();
    }
    case 'interval': {
      const ms = parseInt(schedule, 10);
      if (isNaN(ms) || ms <= 0) throw new Error(`Invalid interval: "${schedule}"`);
      return new Date(Date.now() + ms).toISOString();
    }
    case 'one-shot':
      return schedule;
  }
}

/** Map a raw SQLite row to a ScheduledTask */
function rowToTask(row: RawTaskRow): ScheduledTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type as TaskType,
    schedule: row.schedule,
    action: JSON.parse(row.action) as TaskAction,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
  };
}

export class TaskScheduler {
  private db: Database;
  private onTask: (task: ScheduledTask) => Promise<void>;
  private log: (msg: string) => void;

  private addStmt: ReturnType<Database['query']>;
  private deleteStmt: ReturnType<Database['query']>;
  private listAllStmt: ReturnType<Database['query']>;
  private listByWorkspaceStmt: ReturnType<Database['query']>;
  private getByIdStmt: ReturnType<Database['query']>;
  private updateAfterRunStmt: ReturnType<Database['query']>;
  private disableStmt: ReturnType<Database['query']>;

  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private inFlight = new Set<Promise<void>>();

  constructor(
    db: Database,
    onTask: (task: ScheduledTask) => Promise<void>,
    log?: (msg: string) => void,
  ) {
    this.db = db;
    this.onTask = onTask;
    this.log = log ?? (() => {});

    // Create table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('cron', 'interval', 'one-shot')),
        schedule TEXT NOT NULL,
        action TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);

    // Create index
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled
      ON scheduled_tasks (enabled, next_run_at)
      WHERE enabled = 1
    `);

    // Prepare statements
    this.addStmt = this.db.query(
      `INSERT INTO scheduled_tasks (workspace_id, type, schedule, action, enabled, next_run_at)
       VALUES ($workspaceId, $type, $schedule, $action, $enabled, $nextRunAt)
       RETURNING *`,
    );

    this.deleteStmt = this.db.query(`DELETE FROM scheduled_tasks WHERE id = $id`);

    this.listAllStmt = this.db.query(`SELECT * FROM scheduled_tasks ORDER BY id`);

    this.listByWorkspaceStmt = this.db.query(
      `SELECT * FROM scheduled_tasks WHERE workspace_id = $workspaceId ORDER BY id`,
    );

    this.getByIdStmt = this.db.query(`SELECT * FROM scheduled_tasks WHERE id = $id`);

    this.updateAfterRunStmt = this.db.query(
      `UPDATE scheduled_tasks
       SET last_run_at = $lastRunAt, next_run_at = $nextRunAt
       WHERE id = $id`,
    );

    this.disableStmt = this.db.query(
      `UPDATE scheduled_tasks
       SET enabled = 0, last_run_at = $lastRunAt
       WHERE id = $id`,
    );
  }

  /**
   * Add a new scheduled task. Computes nextRunAt based on type and schedule.
   * Throws if a cron expression is invalid.
   */
  addTask(input: {
    workspaceId: string;
    type: TaskType;
    schedule: string;
    action: TaskAction;
    enabled?: boolean;
  }): ScheduledTask {
    const enabled = input.enabled ?? true;
    const nextRunAt = computeNextRunAt(input.type, input.schedule);

    const row = this.addStmt.get({
      $workspaceId: input.workspaceId,
      $type: input.type,
      $schedule: input.schedule,
      $action: JSON.stringify(input.action),
      $enabled: enabled ? 1 : 0,
      $nextRunAt: nextRunAt,
    }) as RawTaskRow;

    const task = rowToTask(row);
    if (task.enabled) {
      this.scheduleNext(task);
    }
    return task;
  }

  /**
   * Remove a task by ID. Cancels its active timer if running.
   */
  removeTask(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.deleteStmt.run({ $id: id });
  }

  /**
   * List tasks, optionally filtered by workspace.
   */
  listTasks(workspaceId?: string): ScheduledTask[] {
    const rows = workspaceId
      ? (this.listByWorkspaceStmt.all({ $workspaceId: workspaceId }) as RawTaskRow[])
      : (this.listAllStmt.all() as RawTaskRow[]);
    return rows.map(rowToTask);
  }

  /**
   * Get a single task by ID, or null if not found.
   */
  getTask(id: number): ScheduledTask | null {
    const row = this.getByIdStmt.get({ $id: id }) as RawTaskRow | null;
    return row ? rowToTask(row) : null;
  }

  /**
   * Load all enabled tasks from the database and schedule them.
   * Tasks with nextRunAt in the past are caught up immediately.
   */
  start(): void {
    const rows = this.db
      .query(`SELECT * FROM scheduled_tasks WHERE enabled = 1`)
      .all() as RawTaskRow[];

    for (const row of rows) {
      const task = rowToTask(row);
      this.scheduleNext(task);
    }

    this.log(`[task-scheduler] Started with ${rows.length} enabled tasks`);
  }

  /**
   * Cancel all pending timers and await any in-flight task callbacks.
   */
  async stop(): Promise<void> {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();

    if (this.inFlight.size > 0) {
      this.log(`[task-scheduler] Waiting for ${this.inFlight.size} in-flight tasks`);
      await Promise.all(this.inFlight);
    }

    this.log('[task-scheduler] Stopped');
  }

  /**
   * Schedule the next execution of a task based on its nextRunAt.
   */
  private scheduleNext(task: ScheduledTask): void {
    const delay = Math.max(0, new Date(task.nextRunAt).getTime() - Date.now());

    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      const promise = this.executeTask(task);
      this.inFlight.add(promise);
      promise.finally(() => this.inFlight.delete(promise));
    }, delay);

    this.timers.set(task.id, timer);
  }

  /**
   * Execute a task callback and schedule the next occurrence.
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    let callbackFailed = false;
    try {
      await this.onTask(task);
    } catch (err) {
      callbackFailed = true;
      this.log(`[task-scheduler] Task ${task.id} (${task.type}) callback failed: ${err}`);
    }

    try {
      const now = new Date().toISOString();

      if (task.type === 'one-shot') {
        this.disableStmt.run({ $id: task.id, $lastRunAt: now });
        return;
      }

      const nextRunAt = computeNextRunAt(task.type, task.schedule);
      this.updateAfterRunStmt.run({
        $id: task.id,
        $lastRunAt: now,
        $nextRunAt: nextRunAt,
      });

      const updated = this.getTask(task.id);
      if (updated && updated.enabled) {
        this.scheduleNext(updated);
      }
    } catch (err) {
      this.log(`[task-scheduler] Task ${task.id} reschedule error: ${err}`);
    }
  }
}
