/**
 * SQLite Message Queue
 *
 * Durable message queue backed by bun:sqlite with WAL mode.
 * Supports enqueue, atomic dequeue, and status transitions.
 */

import { Database } from 'bun:sqlite';
import type { MessageDirection, QueuedMessage } from './types.ts';

/** Row shape returned by SQLite before payload deserialization */
interface RawMessageRow {
  id: number;
  direction: string;
  channel_id: string;
  status: string;
  payload: string;
  created_at: string;
  processed_at: string | null;
  error: string | null;
  retry_count: number;
}

/**
 * SQLite-backed message queue for the daemon subprocess.
 * Uses WAL mode for concurrent read safety and prepared statements for performance.
 */
export class MessageQueue {
  private db: Database;
  private enqueueStmt: ReturnType<Database['query']>;
  private dequeueStmt: ReturnType<Database['query']>;
  private markProcessedStmt: ReturnType<Database['query']>;
  private markFailedStmt: ReturnType<Database['query']>;
  private getPollingStateStmt: ReturnType<Database['query']>;
  private setPollingStateStmt: ReturnType<Database['query']>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Configure WAL mode and pragmas
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA busy_timeout = 5000');
    this.db.run('PRAGMA synchronous = NORMAL');

    // Create messages table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
        channel_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'processing', 'processed', 'failed')),
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        processed_at TEXT,
        error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create indices
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_pending
      ON messages (direction, status, created_at)
      WHERE status = 'pending'
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_channel
      ON messages (channel_id, direction, created_at)
    `);

    // Create polling state table for adapter restart resilience
    this.db.run(`
      CREATE TABLE IF NOT EXISTS polling_state (
        adapter_id TEXT NOT NULL,
        channel_source_id TEXT NOT NULL,
        last_timestamp TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (adapter_id, channel_source_id)
      )
    `);

    // Prepare statements
    this.enqueueStmt = this.db.query(
      `INSERT INTO messages (direction, channel_id, payload)
       VALUES ($direction, $channelId, $payload)`,
    );

    this.dequeueStmt = this.db.query(
      `UPDATE messages
       SET status = 'processing', processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = (
         SELECT id FROM messages
         WHERE direction = $direction AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1
       )
       RETURNING *`,
    );

    this.markProcessedStmt = this.db.query(
      `UPDATE messages SET status = 'processed' WHERE id = $id`,
    );

    this.markFailedStmt = this.db.query(
      `UPDATE messages
       SET status = 'failed', error = $error, retry_count = retry_count + 1
       WHERE id = $id`,
    );

    this.getPollingStateStmt = this.db.query(
      `SELECT last_timestamp FROM polling_state
       WHERE adapter_id = $adapterId AND channel_source_id = $channelSourceId`,
    );

    this.setPollingStateStmt = this.db.query(
      `INSERT OR REPLACE INTO polling_state (adapter_id, channel_source_id, last_timestamp, updated_at)
       VALUES ($adapterId, $channelSourceId, $lastTimestamp, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    );
  }

  /**
   * Add a message to the queue. Returns the auto-generated row ID.
   */
  enqueue(direction: MessageDirection, channelId: string, payload: unknown): number {
    const result = this.enqueueStmt.run({
      $direction: direction,
      $channelId: channelId,
      $payload: JSON.stringify(payload),
    });
    return result.lastInsertRowid as number;
  }

  /**
   * Atomically claim the oldest pending message for the given direction.
   * Returns the message with its payload deserialized, or null if none pending.
   */
  dequeue(direction: MessageDirection): QueuedMessage | null {
    const row = this.dequeueStmt.get({ $direction: direction }) as RawMessageRow | null;
    if (!row) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      console.error(`[message-queue] Corrupted payload for message ${row.id}, marking failed`);
      this.markFailed(row.id, 'corrupted payload: invalid JSON');
      return null;
    }

    return {
      id: row.id,
      direction: row.direction as MessageDirection,
      channelId: row.channel_id,
      status: row.status as QueuedMessage['status'],
      payload,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      error: row.error,
      retryCount: row.retry_count,
    };
  }

  /**
   * Mark a message as successfully processed.
   */
  markProcessed(id: number): void {
    this.markProcessedStmt.run({ $id: id });
  }

  /**
   * Mark a message as failed with an error description. Increments retry_count.
   */
  markFailed(id: number, error: string): void {
    this.markFailedStmt.run({ $id: id, $error: error });
  }

  /**
   * Get the last known polling timestamp for an adapter/channel pair.
   * Returns null if no state has been recorded.
   */
  getPollingState(adapterId: string, channelSourceId: string): string | null {
    const row = this.getPollingStateStmt.get({
      $adapterId: adapterId,
      $channelSourceId: channelSourceId,
    }) as { last_timestamp: string } | null;
    return row?.last_timestamp ?? null;
  }

  /**
   * Store or update the polling timestamp for an adapter/channel pair.
   * Uses INSERT OR REPLACE for upsert behavior.
   */
  setPollingState(adapterId: string, channelSourceId: string, lastTimestamp: string): void {
    this.setPollingStateStmt.run({
      $adapterId: adapterId,
      $channelSourceId: channelSourceId,
      $lastTimestamp: lastTimestamp,
    });
  }

  /**
   * Get the underlying Database instance for sharing with other modules
   * (e.g., TaskScheduler).
   */
  getDb(): Database {
    return this.db;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
