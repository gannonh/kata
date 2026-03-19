import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initDebugLog,
  closeDebugLog,
  dlog,
  isDebugLogEnabled,
} from '../debug-log.ts';

test('debug log is disabled when KATA_DEBUG is not set', () => {
  const saved = process.env.KATA_DEBUG;
  delete process.env.KATA_DEBUG;
  try {
    const tmp = mkdtempSync(join(tmpdir(), 'kata-debug-'));
    initDebugLog(tmp);
    assert.equal(isDebugLogEnabled(), false);
    dlog('test-event', { key: 'value' });
    assert.equal(existsSync(join(tmp, '.kata', 'debug.log')), false);
    closeDebugLog();
  } finally {
    if (saved !== undefined) process.env.KATA_DEBUG = saved;
    else delete process.env.KATA_DEBUG;
  }
});

test('debug log writes events when KATA_DEBUG=1', () => {
  const saved = process.env.KATA_DEBUG;
  process.env.KATA_DEBUG = '1';
  try {
    const tmp = mkdtempSync(join(tmpdir(), 'kata-debug-'));
    initDebugLog(tmp);
    assert.equal(isDebugLogEnabled(), true);

    dlog('dispatch', { unit: 'research-slice', id: 'M001/S07', phase: 'planning' });
    dlog('agent-end', { unit: 'research-slice', id: 'M001/S07' });
    closeDebugLog();

    const logPath = join(tmp, '.kata', 'debug.log');
    assert.equal(existsSync(logPath), true);

    const content = readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[auto-start]'), 'should have session header');
    assert.ok(content.includes('[dispatch]'), 'should have dispatch event');
    assert.ok(content.includes('unit=research-slice'), 'should have unit field');
    assert.ok(content.includes('id=M001/S07'), 'should have id field');
    assert.ok(content.includes('[agent-end]'), 'should have agent-end event');
    assert.ok(content.includes('[auto-stop]'), 'should have close event');
  } finally {
    if (saved !== undefined) process.env.KATA_DEBUG = saved;
    else delete process.env.KATA_DEBUG;
  }
});

test('debug log handles values with spaces using quotes', () => {
  const saved = process.env.KATA_DEBUG;
  process.env.KATA_DEBUG = '1';
  try {
    const tmp = mkdtempSync(join(tmpdir(), 'kata-debug-'));
    initDebugLog(tmp);

    dlog('provider-error', { error: 'fetch failed', streak: 3 });
    closeDebugLog();

    const content = readFileSync(join(tmp, '.kata', 'debug.log'), 'utf-8');
    assert.ok(content.includes('error="fetch failed"'), 'should quote values with spaces');
    assert.ok(content.includes('streak=3'), 'should not quote numeric values');
  } finally {
    if (saved !== undefined) process.env.KATA_DEBUG = saved;
    else delete process.env.KATA_DEBUG;
  }
});

test('debug log is disabled when KATA_DEBUG=0', () => {
  const saved = process.env.KATA_DEBUG;
  process.env.KATA_DEBUG = '0';
  try {
    const tmp = mkdtempSync(join(tmpdir(), 'kata-debug-'));
    initDebugLog(tmp);
    assert.equal(isDebugLogEnabled(), false);
    closeDebugLog();
  } finally {
    if (saved !== undefined) process.env.KATA_DEBUG = saved;
    else delete process.env.KATA_DEBUG;
  }
});
