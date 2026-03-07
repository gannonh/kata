import { describe, test, expect, afterEach } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { unlinkSync } from 'fs';
import { Database } from 'bun:sqlite';
import { MessageQueue } from '../message-queue.ts';

describe('MessageQueue', () => {
  let dbPath: string;
  let queue: MessageQueue;

  function createQueue(): MessageQueue {
    dbPath = join(tmpdir(), `test-daemon-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    queue = new MessageQueue(dbPath);
    return queue;
  }

  afterEach(() => {
    try {
      queue?.close();
    } catch {
      // already closed
    }
    try {
      unlinkSync(dbPath);
      unlinkSync(`${dbPath}-wal`);
      unlinkSync(`${dbPath}-shm`);
    } catch {
      // files may not exist
    }
  });

  test('creates database with WAL mode', () => {
    createQueue();
    const db = new Database(dbPath, { readonly: true });
    const result = db.query('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(result.journal_mode).toBe('wal');
    db.close();
  });

  test('creates messages table', () => {
    createQueue();
    const db = new Database(dbPath, { readonly: true });
    const result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .get() as { name: string } | null;
    expect(result).not.toBeNull();
    expect(result!.name).toBe('messages');
    db.close();
  });

  test('enqueue returns integer ID', () => {
    createQueue();
    const id = queue.enqueue('inbound', 'slack-general', { text: 'hello' });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  test('dequeue returns oldest pending message', () => {
    createQueue();
    queue.enqueue('inbound', 'slack-general', { text: 'first' });
    queue.enqueue('inbound', 'slack-general', { text: 'second' });
    queue.enqueue('inbound', 'slack-general', { text: 'third' });

    const msg = queue.dequeue('inbound');
    expect(msg).not.toBeNull();
    expect(msg!.payload).toEqual({ text: 'first' });
  });

  test('dequeue returns null when empty', () => {
    createQueue();
    const msg = queue.dequeue('inbound');
    expect(msg).toBeNull();
  });

  test('dequeue atomically sets status to processing', () => {
    createQueue();
    const id = queue.enqueue('inbound', 'slack-general', { text: 'test' });
    queue.dequeue('inbound');

    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT status FROM messages WHERE id = ?').get(id) as { status: string };
    expect(row.status).toBe('processing');
    db.close();
  });

  test('markProcessed sets status', () => {
    createQueue();
    const id = queue.enqueue('inbound', 'slack-general', { text: 'test' });
    queue.dequeue('inbound');
    queue.markProcessed(id);

    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT status FROM messages WHERE id = ?').get(id) as { status: string };
    expect(row.status).toBe('processed');
    db.close();
  });

  test('markFailed sets error and increments retryCount', () => {
    createQueue();
    const id = queue.enqueue('inbound', 'slack-general', { text: 'test' });
    queue.dequeue('inbound');
    queue.markFailed(id, 'connection timeout');

    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT status, error, retry_count FROM messages WHERE id = ?').get(id) as {
      status: string;
      error: string;
      retry_count: number;
    };
    expect(row.status).toBe('failed');
    expect(row.error).toBe('connection timeout');
    expect(row.retry_count).toBe(1);
    db.close();
  });

  test('dequeue skips processing messages', () => {
    createQueue();
    queue.enqueue('inbound', 'slack-general', { text: 'first' });
    queue.enqueue('inbound', 'slack-general', { text: 'second' });

    // Dequeue first (marks it processing)
    const first = queue.dequeue('inbound');
    expect(first!.payload).toEqual({ text: 'first' });

    // Dequeue again should skip the processing one and return second
    const second = queue.dequeue('inbound');
    expect(second).not.toBeNull();
    expect(second!.payload).toEqual({ text: 'second' });
  });

  describe('polling state', () => {
    test('getPollingState returns null for unknown adapter/channel', () => {
      createQueue();
      const result = queue.getPollingState('slack-adapter', 'C123');
      expect(result).toBeNull();
    });

    test('setPollingState stores and getPollingState retrieves the timestamp', () => {
      createQueue();
      queue.setPollingState('slack-adapter', 'C123', '1678886400.123456');
      const result = queue.getPollingState('slack-adapter', 'C123');
      expect(result).toBe('1678886400.123456');
    });

    test('setPollingState overwrites previous value for same adapter/channel', () => {
      createQueue();
      queue.setPollingState('slack-adapter', 'C123', '1678886400.000000');
      queue.setPollingState('slack-adapter', 'C123', '1678886500.000000');
      const result = queue.getPollingState('slack-adapter', 'C123');
      expect(result).toBe('1678886500.000000');
    });

    test('different adapter/channel combos are independent', () => {
      createQueue();
      queue.setPollingState('slack-adapter', 'C123', '1000.0');
      queue.setPollingState('slack-adapter', 'C456', '2000.0');
      queue.setPollingState('whatsapp-adapter', 'C123', '3000.0');

      expect(queue.getPollingState('slack-adapter', 'C123')).toBe('1000.0');
      expect(queue.getPollingState('slack-adapter', 'C456')).toBe('2000.0');
      expect(queue.getPollingState('whatsapp-adapter', 'C123')).toBe('3000.0');
    });
  });

  test('close closes database', () => {
    createQueue();
    queue.enqueue('inbound', 'slack-general', { text: 'test' });
    queue.close();

    // Verify no errors occurred - opening a new connection should work
    const db = new Database(dbPath, { readonly: true });
    const row = db.query('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    expect(row.count).toBe(1);
    db.close();
  });
});
