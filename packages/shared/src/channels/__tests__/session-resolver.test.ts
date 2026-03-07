import { describe, test, expect } from 'bun:test';
import { resolveSessionKey } from '../session-resolver.ts';

describe('resolveSessionKey', () => {
  test('produces deterministic session key for same inputs', () => {
    const key1 = resolveSessionKey('slack', 'ws1', 'thread123', 'C123');
    const key2 = resolveSessionKey('slack', 'ws1', 'thread123', 'C123');
    expect(key1).toBe(key2);
  });

  test('uses threadId when defined', () => {
    const withThread = resolveSessionKey('slack', 'ws1', 'thread123', 'C123');
    expect(withThread).toMatch(/^daemon-slack-[a-f0-9]{12}$/);
  });

  test('falls back to channelSourceId when threadId is undefined', () => {
    const noThread = resolveSessionKey('slack', 'ws1', undefined, 'C123');
    expect(noThread).toMatch(/^daemon-slack-[a-f0-9]{12}$/);
  });

  test('different threadIds produce different keys', () => {
    const key1 = resolveSessionKey('slack', 'ws1', 'threadA', 'C123');
    const key2 = resolveSessionKey('slack', 'ws1', 'threadB', 'C123');
    expect(key1).not.toBe(key2);
  });

  test('different workspaceIds produce different keys', () => {
    const key1 = resolveSessionKey('slack', 'ws1', 'thread1', 'C123');
    const key2 = resolveSessionKey('slack', 'ws2', 'thread1', 'C123');
    expect(key1).not.toBe(key2);
  });

  test('different channelSlugs produce different keys', () => {
    const key1 = resolveSessionKey('slack', 'ws1', 'thread1', 'C123');
    const key2 = resolveSessionKey('whatsapp', 'ws1', 'thread1', 'C123');
    expect(key1).not.toBe(key2);
    // Also check prefix differs
    expect(key1).toMatch(/^daemon-slack-/);
    expect(key2).toMatch(/^daemon-whatsapp-/);
  });

  test('threadId undefined falls back to channelSourceId, producing different key than with threadId', () => {
    const withThread = resolveSessionKey('slack', 'ws1', 'thread123', 'C123');
    const withoutThread = resolveSessionKey('slack', 'ws1', undefined, 'C123');
    expect(withThread).not.toBe(withoutThread);
  });

  test('output length is consistent: daemon-{slug}-{12 hex chars}', () => {
    const key = resolveSessionKey('slack', 'ws1', 'thread1', 'C123');
    const parts = key.split('-');
    // daemon-slack-<hash>
    expect(parts[0]).toBe('daemon');
    expect(parts[1]).toBe('slack');
    expect(parts[2]).toMatch(/^[a-f0-9]{12}$/);
  });

  test('resetCount=0 produces the same key as default (no suffix)', () => {
    const defaultKey = resolveSessionKey('slack', 'ws1', 'thread1', 'C123');
    const explicitZero = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 0);
    expect(defaultKey).toBe(explicitZero);
  });

  test('resetCount=1 produces a different key from resetCount=0', () => {
    const key0 = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 0);
    const key1 = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 1);
    expect(key0).not.toBe(key1);
  });

  test('resetCount=1 is deterministic (same inputs produce same output)', () => {
    const key1a = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 1);
    const key1b = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 1);
    expect(key1a).toBe(key1b);
  });

  test('different resetCount values produce different keys', () => {
    const key1 = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 1);
    const key2 = resolveSessionKey('slack', 'ws1', 'thread1', 'C123', 2);
    expect(key1).not.toBe(key2);
  });
});
