import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { ChannelRunner } from '../channel-runner.ts';
import type { ChannelAdapter, ChannelConfig, ChannelMessage } from '../../channels/types.ts';
import type { DaemonEvent } from '../types.ts';
import type { MessageQueue } from '../message-queue.ts';

function makeFakeAdapter(overrides: Partial<ChannelAdapter> = {}): ChannelAdapter & {
  configure: ReturnType<typeof mock>;
  startCallback: ((msg: ChannelMessage) => void) | null;
} {
  let startCallback: ((msg: ChannelMessage) => void) | null = null;
  return {
    id: 'fake',
    name: 'Fake',
    type: 'poll' as const,
    configure: mock(() => {}),
    start: mock(async (_config: ChannelConfig, onMessage: (msg: ChannelMessage) => void) => {
      startCallback = onMessage;
    }),
    stop: mock(async () => {}),
    isHealthy: () => true,
    getLastError: () => null,
    get startCallback() {
      return startCallback;
    },
    ...overrides,
  };
}

function makeFakeQueue(): MessageQueue {
  return {
    enqueue: mock(() => 1),
    dequeue: mock(() => null),
    markProcessed: mock(() => {}),
    markFailed: mock(() => {}),
    getPollingState: mock(() => null),
    setPollingState: mock(() => {}),
    close: mock(() => {}),
  } as unknown as MessageQueue;
}

function makeConfig(overrides?: Partial<ChannelConfig>): ChannelConfig {
  return {
    slug: 'test-channel',
    enabled: true,
    adapter: 'slack',
    pollIntervalMs: 60_000,
    credentials: { sourceSlug: 'slack-token' },
    filter: { channelIds: ['C_GENERAL'], triggerPatterns: [] },
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channelId: 'test-channel',
    source: 'U_ALICE',
    timestamp: Date.now(),
    content: 'hello world',
    metadata: { slackChannel: 'C_GENERAL' },
    ...overrides,
  };
}

describe('ChannelRunner', () => {
  let queue: MessageQueue;
  let events: DaemonEvent[];
  let emitFn: (event: DaemonEvent) => void;

  beforeEach(() => {
    queue = makeFakeQueue();
    events = [];
    emitFn = (event) => events.push(event);
  });

  test('startAll creates adapters for each enabled config', async () => {
    const config1 = makeConfig({ slug: 'ch-1' });
    const config2 = makeConfig({ slug: 'ch-2' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config1, config2],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    const adapters: ChannelAdapter[] = [];
    const factory = () => {
      const a = makeFakeAdapter();
      adapters.push(a);
      return a;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    expect(adapters).toHaveLength(2);
    expect((adapters[0]!.start as ReturnType<typeof mock>)).toHaveBeenCalledTimes(1);
    expect((adapters[1]!.start as ReturnType<typeof mock>)).toHaveBeenCalledTimes(1);
  });

  test('startAll skips disabled configs', async () => {
    const config = makeConfig({ slug: 'ch-disabled', enabled: false });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    const adapters: ChannelAdapter[] = [];
    const factory = () => {
      const a = makeFakeAdapter();
      adapters.push(a);
      return a;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    expect(adapters).toHaveLength(0);
  });

  test('startAll skips unknown adapter types and emits error', async () => {
    const config = makeConfig({ slug: 'ch-unknown', adapter: 'discord' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map(),
        },
      ],
    ]);

    const factory = () => null;

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('plugin_error');
    const errorEvent = events[0] as { type: 'plugin_error'; pluginId: string; error: string };
    expect(errorEvent.pluginId).toBe('discord');
    expect(errorEvent.error).toContain('Unknown adapter type');
  });

  test('handleMessage enqueues message when trigger matches', async () => {
    const config = makeConfig({ slug: 'ch-1' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    let capturedAdapter: ReturnType<typeof makeFakeAdapter> | null = null;
    const factory = () => {
      capturedAdapter = makeFakeAdapter();
      return capturedAdapter;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    // Simulate a message arriving
    const msg = makeMessage({ id: 'msg-42', content: 'hey there' });
    capturedAdapter!.startCallback!(msg);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const enqueueCall = (queue.enqueue as ReturnType<typeof mock>).mock.calls[0] as unknown[];
    expect(enqueueCall[0]).toBe('inbound');
    expect(enqueueCall[1]).toBe('ch-1');
  });

  test('handleMessage skips message when trigger does not match', async () => {
    const config = makeConfig({
      slug: 'ch-trigger',
      filter: { channelIds: ['C_GENERAL'], triggerPatterns: ['@kata'] },
    });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    let capturedAdapter: ReturnType<typeof makeFakeAdapter> | null = null;
    const factory = () => {
      capturedAdapter = makeFakeAdapter();
      return capturedAdapter;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    // Message without the trigger pattern
    const msg = makeMessage({ content: 'just chatting' });
    capturedAdapter!.startCallback!(msg);

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  test('handleMessage attaches sessionKey to message metadata', async () => {
    const config = makeConfig({ slug: 'ch-session' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    let capturedAdapter: ReturnType<typeof makeFakeAdapter> | null = null;
    const factory = () => {
      capturedAdapter = makeFakeAdapter();
      return capturedAdapter;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    const msg = makeMessage({
      metadata: { slackChannel: 'C_GENERAL' },
      replyTo: { threadId: 'thread-123', messageId: 'msg-1' },
    });
    capturedAdapter!.startCallback!(msg);

    expect(msg.metadata.sessionKey).toBeDefined();
    expect(typeof msg.metadata.sessionKey).toBe('string');
    expect((msg.metadata.sessionKey as string).startsWith('daemon-ch-session-')).toBe(true);

    // Verify message_received event emitted
    const msgEvent = events.find((e) => e.type === 'message_received');
    expect(msgEvent).toBeDefined();
  });

  test('startAll emits error when token is missing for adapter', async () => {
    const config = makeConfig({ slug: 'ch-no-token' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map(), // No tokens
        },
      ],
    ]);

    const adapters: ChannelAdapter[] = [];
    const factory = () => {
      const a = makeFakeAdapter();
      adapters.push(a);
      return a;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    // Adapter was created but not started due to missing token
    expect(adapters).toHaveLength(1);
    expect((adapters[0]!.start as ReturnType<typeof mock>)).not.toHaveBeenCalled();

    // Error event emitted
    const errorEvents = events.filter((e) => e.type === 'plugin_error');
    expect(errorEvents).toHaveLength(1);
    const errorEvent = errorEvents[0] as { type: 'plugin_error'; pluginId: string; error: string };
    expect(errorEvent.pluginId).toBe('ch-no-token');
    expect(errorEvent.error).toContain('No token found');
  });

  test('startAll passes appToken to Slack adapter configure when appTokenSlug is present', async () => {
    const config = makeConfig({
      slug: 'ch-slash',
      credentials: { sourceSlug: 'slack-token', appTokenSlug: 'slack-app-token' },
    });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map([
            ['slack-token', 'xoxb-test'],
            ['slack-app-token', 'xapp-test-app'],
          ]),
        },
      ],
    ]);

    let capturedAdapter: ReturnType<typeof makeFakeAdapter> | null = null;
    const factory = () => {
      capturedAdapter = makeFakeAdapter();
      return capturedAdapter;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    expect(capturedAdapter).not.toBeNull();
    // configure was called with token, pollingState, and appToken
    const configureCall = (capturedAdapter!.configure as ReturnType<typeof mock>).mock.calls[0] as unknown[];
    expect(configureCall[0]).toBe('xoxb-test');
    expect(configureCall[2]).toBe('xapp-test-app');
  });

  test('startAll passes undefined appToken when appTokenSlug is absent', async () => {
    const config = makeConfig({ slug: 'ch-poll-only' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    let capturedAdapter: ReturnType<typeof makeFakeAdapter> | null = null;
    const factory = () => {
      capturedAdapter = makeFakeAdapter();
      return capturedAdapter;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    expect(capturedAdapter).not.toBeNull();
    const configureCall = (capturedAdapter!.configure as ReturnType<typeof mock>).mock.calls[0] as unknown[];
    expect(configureCall[0]).toBe('xoxb-test');
    // appToken should be undefined when no appTokenSlug configured
    expect(configureCall[2]).toBeUndefined();
  });

  test('stopAll calls stop on all running adapters', async () => {
    const config1 = makeConfig({ slug: 'ch-a' });
    const config2 = makeConfig({ slug: 'ch-b' });
    const wsConfigs = new Map([
      [
        'ws-1',
        {
          workspaceId: 'ws-1',
          configs: [config1, config2],
          tokens: new Map([['slack-token', 'xoxb-test']]),
        },
      ],
    ]);

    const adapters: ChannelAdapter[] = [];
    const factory = () => {
      const a = makeFakeAdapter();
      adapters.push(a);
      return a;
    };

    const runner = new ChannelRunner(queue, emitFn, wsConfigs, () => {}, factory);
    await runner.startAll();

    expect(adapters).toHaveLength(2);

    await runner.stopAll();

    expect((adapters[0]!.stop as ReturnType<typeof mock>)).toHaveBeenCalledTimes(1);
    expect((adapters[1]!.stop as ReturnType<typeof mock>)).toHaveBeenCalledTimes(1);
  });
});
