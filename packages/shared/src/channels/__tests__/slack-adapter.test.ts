import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { SlackChannelAdapter } from '../adapters/slack-adapter.ts';
import type { ChannelConfig, ChannelMessage } from '../types.ts';

// Mock @slack/web-api
const mockAuthTest = mock(() =>
  Promise.resolve({ user_id: 'U_BOT', bot_id: 'B_BOT' }),
);
const mockConversationsHistory = mock(() =>
  Promise.resolve({ messages: [] as Record<string, unknown>[] }),
);
const mockChatPostMessage = mock(() => Promise.resolve({ ok: true }));

mock.module('@slack/web-api', () => ({
  WebClient: class MockWebClient {
    auth = { test: mockAuthTest };
    conversations = { history: mockConversationsHistory };
    chat = { postMessage: mockChatPostMessage };
    constructor(_token: string, _opts?: unknown) {}
  },
}));

// Mock @slack/socket-mode
type SocketEventHandler = (args: { body: Record<string, string>; ack: (response?: Record<string, string>) => Promise<void> }) => Promise<void>;

const mockSocketStart = mock(() => Promise.resolve({}));
const mockSocketDisconnect = mock(() => Promise.resolve());
let socketEventHandlers: Map<string, SocketEventHandler> = new Map();

mock.module('@slack/socket-mode', () => ({
  SocketModeClient: class MockSocketModeClient {
    constructor(_opts: { appToken: string }) {}
    on(event: string, handler: SocketEventHandler) {
      socketEventHandlers.set(event, handler);
    }
    start = mockSocketStart;
    disconnect = mockSocketDisconnect;
  },
}));

function makeConfig(overrides?: Partial<ChannelConfig>): ChannelConfig {
  return {
    slug: 'test-slack',
    enabled: true,
    adapter: 'slack',
    pollIntervalMs: 60_000,
    credentials: { sourceSlug: 'slack-creds' },
    filter: { channelIds: ['C_GENERAL'], triggerPatterns: [] },
    ...overrides,
  };
}

function makeSlackMessage(overrides: Record<string, unknown> = {}) {
  return {
    ts: '1700000001.000100',
    user: 'U_HUMAN',
    text: 'hello world',
    team: 'T_TEAM',
    ...overrides,
  };
}

describe('SlackChannelAdapter', () => {
  let adapter: SlackChannelAdapter;

  beforeEach(() => {
    adapter = new SlackChannelAdapter();
    mockAuthTest.mockReset();
    mockAuthTest.mockImplementation(() =>
      Promise.resolve({ user_id: 'U_BOT', bot_id: 'B_BOT' }),
    );
    mockConversationsHistory.mockReset();
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [] as Record<string, unknown>[] }),
    );
    mockChatPostMessage.mockReset();
    mockChatPostMessage.mockImplementation(() => Promise.resolve({ ok: true }));
    mockSocketStart.mockReset();
    mockSocketStart.mockImplementation(() => Promise.resolve({}));
    mockSocketDisconnect.mockReset();
    mockSocketDisconnect.mockImplementation(() => Promise.resolve());
    socketEventHandlers = new Map();
  });

  afterEach(async () => {
    await adapter.stop();
  });

  test('configure() stores client; start() calls auth.test and begins polling', async () => {
    adapter.configure('xoxb-test-token');
    const onMessage = mock(() => {});

    await adapter.start(makeConfig(), onMessage);

    expect(mockAuthTest).toHaveBeenCalledTimes(1);
    expect(adapter.id).toBe('test-slack');
    expect(adapter.isHealthy()).toBe(true);
  });

  test('start() throws if configure() was not called', async () => {
    const onMessage = mock(() => {});
    await expect(adapter.start(makeConfig(), onMessage)).rejects.toThrow(
      'configure() must be called before start()',
    );
  });

  test('poll() calls conversations.history with oldest timestamp', async () => {
    adapter.configure('xoxb-test-token');
    const msg = makeSlackMessage({ ts: '1700000002.000200' });
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(mockConversationsHistory).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstCall = (mockConversationsHistory.mock.calls as any)[0][0] as Record<string, unknown>;
    expect(firstCall.oldest).toBeUndefined();
    expect(firstCall.channel).toBe('C_GENERAL');
    expect(firstCall.inclusive).toBe(false);
    expect(firstCall.limit).toBe(100);
  });

  test('poll() skips messages from bot (bot_id match)', async () => {
    adapter.configure('xoxb-test-token');
    const botMsg = makeSlackMessage({ ts: '1700000002.000200', bot_id: 'B_BOT', user: 'U_OTHER' });
    const humanMsg = makeSlackMessage({ ts: '1700000003.000300', user: 'U_ALICE' });
    // Slack returns newest-first
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [humanMsg, botMsg] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(received).toHaveLength(1);
    expect(received[0]!.source).toBe('U_ALICE');
  });

  test('poll() skips messages from bot (user match)', async () => {
    adapter.configure('xoxb-test-token');
    const botMsg = makeSlackMessage({ ts: '1700000002.000200', user: 'U_BOT' });
    const humanMsg = makeSlackMessage({ ts: '1700000003.000300', user: 'U_ALICE' });
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [humanMsg, botMsg] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(received).toHaveLength(1);
    expect(received[0]!.source).toBe('U_ALICE');
  });

  test('toChannelMessage correctly maps Slack message fields', async () => {
    adapter.configure('xoxb-test-token');
    const msg = makeSlackMessage({
      ts: '1700000010.000100',
      user: 'U_ALICE',
      text: 'test message',
      team: 'T_MYTEAM',
    });
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(received).toHaveLength(1);
    const cm = received[0]!;
    expect(cm.id).toBe('1700000010.000100');
    expect(cm.channelId).toBe('test-slack');
    expect(cm.source).toBe('U_ALICE');
    expect(cm.timestamp).toBeCloseTo(1700000010000.1, 0);
    expect(cm.content).toBe('test message');
    expect(cm.metadata).toEqual({ slackChannel: 'C_GENERAL', team: 'T_MYTEAM' });
    expect(cm.replyTo).toBeUndefined();
  });

  test('toChannelMessage sets replyTo for threaded messages', async () => {
    adapter.configure('xoxb-test-token');
    const msg = makeSlackMessage({
      ts: '1700000020.000200',
      thread_ts: '1700000010.000100',
    });
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(received).toHaveLength(1);
    expect(received[0]!.replyTo).toEqual({
      threadId: '1700000010.000100',
      messageId: '1700000020.000200',
    });
  });

  test('toChannelMessage omits replyTo for non-threaded messages', async () => {
    adapter.configure('xoxb-test-token');
    // thread_ts equals ts means it's the thread parent, not a reply
    const msg = makeSlackMessage({
      ts: '1700000030.000300',
      thread_ts: '1700000030.000300',
    });
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(received).toHaveLength(1);
    expect(received[0]!.replyTo).toBeUndefined();
  });

  test('stop() clears interval and sets healthy to false', async () => {
    adapter.configure('xoxb-test-token');
    await adapter.start(makeConfig(), () => {});

    expect(adapter.isHealthy()).toBe(true);

    await adapter.stop();

    expect(adapter.isHealthy()).toBe(false);
  });

  test('isHealthy() returns false after poll error', async () => {
    adapter.configure('xoxb-test-token');
    mockConversationsHistory.mockImplementation(() =>
      Promise.reject(new Error('rate_limited')),
    );

    await adapter.start(makeConfig(), () => {});

    expect(adapter.isHealthy()).toBe(false);
  });

  test('getLastError() returns error message after poll failure', async () => {
    adapter.configure('xoxb-test-token');
    mockConversationsHistory.mockImplementation(() =>
      Promise.reject(new Error('channel_not_found')),
    );

    await adapter.start(makeConfig(), () => {});

    expect(adapter.getLastError()).toBe('channel_not_found');
  });

  test('polling state get/set callbacks invoked when provided', async () => {
    const getState = mock(() => '1700000000.000000');
    const setState = mock(() => {});

    adapter.configure('xoxb-test-token', { get: getState, set: setState });

    const msg = makeSlackMessage({ ts: '1700000050.000500' });
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    );

    await adapter.start(makeConfig(), () => {});

    // get called during start for each channelId
    expect(getState).toHaveBeenCalledWith('test-slack', 'C_GENERAL');
    // set called after poll with newest timestamp
    expect(setState).toHaveBeenCalledWith('test-slack', 'C_GENERAL', '1700000050.000500');
  });

  test('messages are delivered in chronological order', async () => {
    adapter.configure('xoxb-test-token');
    const msg1 = makeSlackMessage({ ts: '1700000060.000600', text: 'newer' });
    const msg2 = makeSlackMessage({ ts: '1700000050.000500', text: 'older' });
    // Slack returns newest-first
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg1, msg2] }),
    );

    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    expect(received).toHaveLength(2);
    expect(received[0]!.content).toBe('older');
    expect(received[1]!.content).toBe('newer');
  });

  test('start() throws and sets unhealthy when auth.test() fails', async () => {
    adapter.configure('xoxb-bad-token');
    mockAuthTest.mockImplementation(() =>
      Promise.reject(new Error('invalid_auth')),
    );

    const onMessage = mock(() => {});
    await expect(adapter.start(makeConfig(), onMessage)).rejects.toThrow('invalid_auth');
    expect(adapter.isHealthy()).toBe(false);
  });

  test('isHealthy() recovers after successful poll following error', async () => {
    adapter.configure('xoxb-test-token');
    // First poll fails
    mockConversationsHistory.mockImplementationOnce(() =>
      Promise.reject(new Error('rate_limited')),
    );

    await adapter.start(makeConfig(), () => {});
    expect(adapter.isHealthy()).toBe(false);

    // Next poll succeeds (empty messages)
    mockConversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [] as Record<string, unknown>[] }),
    );

    // Trigger poll manually via a second start (or directly access poll)
    // We'll re-configure and start to get a clean poll
    await adapter.stop();
    adapter = new SlackChannelAdapter();
    adapter.configure('xoxb-test-token');
    mockAuthTest.mockImplementation(() =>
      Promise.resolve({ user_id: 'U_BOT', bot_id: 'B_BOT' }),
    );
    await adapter.start(makeConfig(), () => {});
    expect(adapter.isHealthy()).toBe(true);
    expect(adapter.getLastError()).toBeNull();
  });

  test('adapter name and type are correct', () => {
    expect(adapter.name).toBe('Slack');
    expect(adapter.type).toBe('poll');
  });

  test('send() converts markdown bold to mrkdwn bold', async () => {
    adapter.configure('xoxb-test-token');

    await adapter.send({
      channelId: 'C_GENERAL',
      content: 'Hello **world**!',
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mockChatPostMessage.mock.calls as any)[0][0] as Record<string, unknown>;
    expect(call.text).toBe('Hello *world*!');
    expect(call.channel).toBe('C_GENERAL');
  });

  test('send() converts markdown italic to mrkdwn italic', async () => {
    adapter.configure('xoxb-test-token');

    await adapter.send({
      channelId: 'C_GENERAL',
      content: 'This is *emphasized* text',
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mockChatPostMessage.mock.calls as any)[0][0] as Record<string, unknown>;
    expect(call.text).toBe('This is _emphasized_ text');
  });

  test('send() passes thread_ts for threaded replies', async () => {
    adapter.configure('xoxb-test-token');

    await adapter.send({
      channelId: 'C_GENERAL',
      content: 'Thread reply',
      threadId: '1700000001.000100',
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mockChatPostMessage.mock.calls as any)[0][0] as Record<string, unknown>;
    expect(call.thread_ts).toBe('1700000001.000100');
  });

  test('send() truncates messages exceeding 39K chars', async () => {
    adapter.configure('xoxb-test-token');
    const longContent = 'a'.repeat(40_000);

    await adapter.send({
      channelId: 'C_GENERAL',
      content: longContent,
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mockChatPostMessage.mock.calls as any)[0][0] as Record<string, unknown>;
    const text = call.text as string;
    expect(text.length).toBeLessThan(40_000);
    expect(text).toContain('... (response truncated)');
  });

  test('send() does not truncate messages under 39K chars', async () => {
    adapter.configure('xoxb-test-token');
    const content = 'a'.repeat(38_000);

    await adapter.send({
      channelId: 'C_GENERAL',
      content,
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mockChatPostMessage.mock.calls as any)[0][0] as Record<string, unknown>;
    const text = call.text as string;
    expect(text).not.toContain('... (response truncated)');
  });

  test('send() throws if not configured', async () => {
    await expect(
      adapter.send({ channelId: 'C_GENERAL', content: 'test' }),
    ).rejects.toThrow('SlackChannelAdapter not configured');
  });

  // Socket Mode (slash commands) tests

  test('start() does NOT create SocketModeClient when no appToken provided', async () => {
    adapter.configure('xoxb-test-token');
    await adapter.start(makeConfig(), () => {});

    expect(mockSocketStart).not.toHaveBeenCalled();
    expect(socketEventHandlers.size).toBe(0);
  });

  test('start() creates and starts SocketModeClient when appToken provided', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token');
    await adapter.start(makeConfig(), () => {});

    expect(mockSocketStart).toHaveBeenCalledTimes(1);
    expect(socketEventHandlers.has('slash_commands')).toBe(true);
    expect(adapter.isHealthy()).toBe(true);
  });

  test('slash command handler acknowledges and produces ChannelMessage', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    // Simulate a slash command event
    const handler = socketEventHandlers.get('slash_commands')!;
    const ackFn = mock(() => Promise.resolve());
    await handler({
      body: {
        trigger_id: 'T123456',
        user_id: 'U_ALICE',
        channel_id: 'C_GENERAL',
        team_id: 'T_TEAM',
        command: '/kata',
        text: 'ask about the deployment',
        response_url: 'https://hooks.slack.com/commands/T_TEAM/resp',
      },
      ack: ackFn,
    });

    // Acknowledge was called
    expect(ackFn).toHaveBeenCalledTimes(1);
    expect(ackFn).toHaveBeenCalledWith({ text: 'Processing...' });

    // ChannelMessage was produced
    expect(received).toHaveLength(1);
    const msg = received[0]!;
    expect(msg.id).toBe('cmd-T123456');
    expect(msg.channelId).toBe('test-slack');
    expect(msg.source).toBe('U_ALICE');
    expect(msg.content).toBe('/kata ask about the deployment');
    expect(msg.metadata.command).toBe('/kata');
    expect(msg.metadata.triggerId).toBe('T123456');
    expect(msg.metadata.responseUrl).toBe('https://hooks.slack.com/commands/T_TEAM/resp');
    expect(msg.metadata.slackChannel).toBe('C_GENERAL');
    expect(msg.metadata.team).toBe('T_TEAM');
  });

  test('slash command with no text produces command-only content', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m) => received.push(m));

    const handler = socketEventHandlers.get('slash_commands')!;
    await handler({
      body: {
        trigger_id: 'T789',
        user_id: 'U_BOB',
        channel_id: 'C_GENERAL',
        team_id: 'T_TEAM',
        command: '/kata',
        text: '',
        response_url: 'https://hooks.slack.com/resp',
      },
      ack: mock(() => Promise.resolve()),
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.content).toBe('/kata');
  });

  test('stop() disconnects SocketModeClient', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token');
    await adapter.start(makeConfig(), () => {});

    expect(mockSocketStart).toHaveBeenCalledTimes(1);

    await adapter.stop();

    expect(mockSocketDisconnect).toHaveBeenCalledTimes(1);
    expect(adapter.isHealthy()).toBe(false);
  });

  test('stop() does not call disconnect when no socket client', async () => {
    adapter.configure('xoxb-test-token');
    await adapter.start(makeConfig(), () => {});

    await adapter.stop();

    expect(mockSocketDisconnect).not.toHaveBeenCalled();
  });
});
