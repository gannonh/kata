import { describe, test, expect } from 'bun:test';
import { createLineParser, formatMessage } from '../ipc.ts';

describe('createLineParser', () => {
  test('parses complete single-line message', () => {
    const lines: string[] = [];
    const feed = createLineParser((line) => lines.push(line));

    feed('{"type":"start"}\n');

    expect(lines).toEqual(['{"type":"start"}']);
  });

  test('parses multiple lines in one chunk', () => {
    const lines: string[] = [];
    const feed = createLineParser((line) => lines.push(line));

    feed('{"a":1}\n{"b":2}\n');

    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  test('handles partial chunks', () => {
    const lines: string[] = [];
    const feed = createLineParser((line) => lines.push(line));

    feed('{"type":"st');
    expect(lines).toEqual([]);

    feed('art"}\n');
    expect(lines).toEqual(['{"type":"start"}']);
  });

  test('skips empty lines', () => {
    const lines: string[] = [];
    const feed = createLineParser((line) => lines.push(line));

    feed('\n\n{"a":1}\n\n');

    expect(lines).toEqual(['{"a":1}']);
  });

  test('handles chunk split mid-character', () => {
    const lines: string[] = [];
    const feed = createLineParser((line) => lines.push(line));

    feed('{"msg":"hello');
    feed(' world"}\n');

    expect(lines).toEqual(['{"msg":"hello world"}']);
  });

  test('does not call callback for incomplete trailing data', () => {
    const lines: string[] = [];
    const feed = createLineParser((line) => lines.push(line));

    feed('{"partial":true');

    expect(lines).toEqual([]);
  });
});

describe('formatMessage', () => {
  test('appends newline', () => {
    const result = formatMessage({ type: 'start' });
    expect(result.endsWith('\n')).toBe(true);
  });

  test('produces valid JSON before newline', () => {
    const result = formatMessage({ type: 'status_changed', status: 'running' });
    const json = result.slice(0, -1);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ type: 'status_changed', status: 'running' });
  });
});
