import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { SlackChannelAdapter } from '../adapters/slack-adapter.ts'
import type { ChannelConfig, ChannelMessage } from '../types.ts'

type SocketEventHandler = (args: {
  body: Record<string, string>
  ack: (response?: Record<string, string>) => Promise<void>
}) => Promise<void>

const slackMocks = vi.hoisted(() => ({
  authTest: vi.fn(() => Promise.resolve({ user_id: 'U_BOT', bot_id: 'B_BOT' })),
  conversationsHistory: vi.fn(() => Promise.resolve({ messages: [] as Record<string, unknown>[] })),
  chatPostMessage: vi.fn(() => Promise.resolve({ ok: true })),
  socketStart: vi.fn(() => Promise.resolve({})),
  socketDisconnect: vi.fn(() => Promise.resolve()),
  socketEventHandlers: new Map<string, SocketEventHandler>(),
}))

vi.mock('@slack/web-api', () => ({
  WebClient: class MockWebClient {
    auth = { test: slackMocks.authTest }
    conversations = { history: slackMocks.conversationsHistory }
    chat = { postMessage: slackMocks.chatPostMessage }
    constructor(_token: string, _opts?: unknown) {}
  },
}))

vi.mock('@slack/socket-mode', () => ({
  SocketModeClient: class MockSocketModeClient {
    constructor(_opts: { appToken: string }) {}
    on(event: string, handler: SocketEventHandler) {
      slackMocks.socketEventHandlers.set(event, handler)
    }
    start = slackMocks.socketStart
    disconnect = slackMocks.socketDisconnect
  },
}))

function makeConfig(overrides?: Partial<ChannelConfig>): ChannelConfig {
  return {
    slug: 'test-slack',
    enabled: true,
    adapter: 'slack',
    pollIntervalMs: 60_000,
    credentials: { sourceSlug: 'slack-creds' },
    filter: { channelIds: ['C_GENERAL'], triggerPatterns: [] },
    ...overrides,
  }
}

function makeSlackMessage(overrides: Record<string, unknown> = {}) {
  return {
    ts: '1700000001.000100',
    user: 'U_HUMAN',
    text: 'hello world',
    team: 'T_TEAM',
    ...overrides,
  }
}

describe('SlackChannelAdapter', () => {
  let adapter: SlackChannelAdapter

  beforeEach(() => {
    adapter = new SlackChannelAdapter()
    slackMocks.authTest.mockReset()
    slackMocks.authTest.mockImplementation(() =>
      Promise.resolve({ user_id: 'U_BOT', bot_id: 'B_BOT' }),
    )
    slackMocks.conversationsHistory.mockReset()
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [] as Record<string, unknown>[] }),
    )
    slackMocks.chatPostMessage.mockReset()
    slackMocks.chatPostMessage.mockImplementation(() => Promise.resolve({ ok: true }))
    slackMocks.socketStart.mockReset()
    slackMocks.socketStart.mockImplementation(() => Promise.resolve({}))
    slackMocks.socketDisconnect.mockReset()
    slackMocks.socketDisconnect.mockImplementation(() => Promise.resolve())
    slackMocks.socketEventHandlers = new Map()
  })

  afterEach(async () => {
    await adapter.stop()
  })

  test('configure() stores client; start() calls auth.test and begins polling', async () => {
    adapter.configure('xoxb-test-token')
    const onMessage = vi.fn(() => {})

    await adapter.start(makeConfig(), onMessage)

    expect(slackMocks.authTest).toHaveBeenCalledTimes(1)
    expect(adapter.id).toBe('test-slack')
    expect(adapter.isHealthy()).toBe(true)
  })

  test('start() throws if configure() was not called', async () => {
    const onMessage = vi.fn(() => {})
    await expect(adapter.start(makeConfig(), onMessage)).rejects.toThrow(
      'configure() must be called before start()',
    )
  })

  test('poll() calls conversations.history with oldest timestamp', async () => {
    adapter.configure('xoxb-test-token')
    const msg = makeSlackMessage({ ts: '1700000002.000200' })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(slackMocks.conversationsHistory).toHaveBeenCalledTimes(1)
    const firstCall = (slackMocks.conversationsHistory.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0]
    expect(firstCall.oldest).toBeUndefined()
    expect(firstCall.channel).toBe('C_GENERAL')
    expect(firstCall.inclusive).toBe(false)
    expect(firstCall.limit).toBe(100)
  })

  test('poll() skips messages from bot (bot_id match)', async () => {
    adapter.configure('xoxb-test-token')
    const botMsg = makeSlackMessage({ ts: '1700000002.000200', bot_id: 'B_BOT', user: 'U_OTHER' })
    const humanMsg = makeSlackMessage({ ts: '1700000003.000300', user: 'U_ALICE' })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [humanMsg, botMsg] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(received).toHaveLength(1)
    expect(received[0]!.source).toBe('U_ALICE')
  })

  test('poll() skips messages from bot (user match)', async () => {
    adapter.configure('xoxb-test-token')
    const botMsg = makeSlackMessage({ ts: '1700000002.000200', user: 'U_BOT' })
    const humanMsg = makeSlackMessage({ ts: '1700000003.000300', user: 'U_ALICE' })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [humanMsg, botMsg] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(received).toHaveLength(1)
    expect(received[0]!.source).toBe('U_ALICE')
  })

  test('toChannelMessage correctly maps Slack message fields', async () => {
    adapter.configure('xoxb-test-token')
    const msg = makeSlackMessage({
      ts: '1700000010.000100',
      user: 'U_ALICE',
      text: 'test message',
      team: 'T_MYTEAM',
    })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(received).toHaveLength(1)
    const cm = received[0]!
    expect(cm.id).toBe('1700000010.000100')
    expect(cm.channelId).toBe('test-slack')
    expect(cm.source).toBe('U_ALICE')
    expect(cm.timestamp).toBeCloseTo(1700000010000.1, 0)
    expect(cm.content).toBe('test message')
    expect(cm.metadata).toEqual({ slackChannel: 'C_GENERAL', team: 'T_MYTEAM' })
    expect(cm.replyTo).toBeUndefined()
  })

  test('toChannelMessage sets replyTo for threaded messages', async () => {
    adapter.configure('xoxb-test-token')
    const msg = makeSlackMessage({
      ts: '1700000020.000200',
      thread_ts: '1700000010.000100',
    })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(received).toHaveLength(1)
    expect(received[0]!.replyTo).toEqual({
      threadId: '1700000010.000100',
      messageId: '1700000020.000200',
    })
  })

  test('toChannelMessage omits replyTo for non-threaded messages', async () => {
    adapter.configure('xoxb-test-token')
    const msg = makeSlackMessage({
      ts: '1700000030.000300',
      thread_ts: '1700000030.000300',
    })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(received).toHaveLength(1)
    expect(received[0]!.replyTo).toBeUndefined()
  })

  test('stop() clears interval and sets healthy to false', async () => {
    adapter.configure('xoxb-test-token')
    await adapter.start(makeConfig(), () => {})

    expect(adapter.isHealthy()).toBe(true)

    await adapter.stop()

    expect(adapter.isHealthy()).toBe(false)
  })

  test('isHealthy() returns false after poll error', async () => {
    adapter.configure('xoxb-test-token')
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.reject(new Error('rate_limited')),
    )

    await adapter.start(makeConfig(), () => {})

    expect(adapter.isHealthy()).toBe(false)
  })

  test('getLastError() returns error message after poll failure', async () => {
    adapter.configure('xoxb-test-token')
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.reject(new Error('channel_not_found')),
    )

    await adapter.start(makeConfig(), () => {})

    expect(adapter.getLastError()).toBe('channel_not_found')
  })

  test('polling state get/set callbacks invoked when provided', async () => {
    const getState = vi.fn(() => '1700000000.000000')
    const setState = vi.fn(() => {})

    adapter.configure('xoxb-test-token', { get: getState, set: setState })

    const msg = makeSlackMessage({ ts: '1700000050.000500' })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg] }),
    )

    await adapter.start(makeConfig(), () => {})

    expect(getState).toHaveBeenCalledWith('test-slack', 'C_GENERAL')
    expect(setState).toHaveBeenCalledWith('test-slack', 'C_GENERAL', '1700000050.000500')
  })

  test('messages are delivered in chronological order', async () => {
    adapter.configure('xoxb-test-token')
    const msg1 = makeSlackMessage({ ts: '1700000060.000600', text: 'newer' })
    const msg2 = makeSlackMessage({ ts: '1700000050.000500', text: 'older' })
    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [msg1, msg2] }),
    )

    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    expect(received).toHaveLength(2)
    expect(received[0]!.content).toBe('older')
    expect(received[1]!.content).toBe('newer')
  })

  test('start() throws and sets unhealthy when auth.test() fails', async () => {
    adapter.configure('xoxb-bad-token')
    slackMocks.authTest.mockImplementation(() =>
      Promise.reject(new Error('invalid_auth')),
    )

    const onMessage = vi.fn(() => {})
    await expect(adapter.start(makeConfig(), onMessage)).rejects.toThrow('invalid_auth')
    expect(adapter.isHealthy()).toBe(false)
  })

  test('isHealthy() recovers after successful poll following error', async () => {
    adapter.configure('xoxb-test-token')
    slackMocks.conversationsHistory.mockImplementationOnce(() =>
      Promise.reject(new Error('rate_limited')),
    )

    await adapter.start(makeConfig(), () => {})
    expect(adapter.isHealthy()).toBe(false)

    slackMocks.conversationsHistory.mockImplementation(() =>
      Promise.resolve({ messages: [] as Record<string, unknown>[] }),
    )

    await adapter.stop()
    adapter = new SlackChannelAdapter()
    adapter.configure('xoxb-test-token')
    slackMocks.authTest.mockImplementation(() =>
      Promise.resolve({ user_id: 'U_BOT', bot_id: 'B_BOT' }),
    )
    await adapter.start(makeConfig(), () => {})
    expect(adapter.isHealthy()).toBe(true)
    expect(adapter.getLastError()).toBeNull()
  })

  test('adapter name and type are correct', () => {
    expect(adapter.name).toBe('Slack')
    expect(adapter.type).toBe('poll')
  })

  test('send() converts markdown bold to mrkdwn bold', async () => {
    adapter.configure('xoxb-test-token')

    await adapter.send({
      channelId: 'C_GENERAL',
      content: 'Hello **world**!',
    })

    expect(slackMocks.chatPostMessage).toHaveBeenCalledTimes(1)
    const call = (slackMocks.chatPostMessage.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0]
    expect(call.text).toBe('Hello *world*!')
    expect(call.channel).toBe('C_GENERAL')
  })

  test('send() converts markdown italic to mrkdwn italic', async () => {
    adapter.configure('xoxb-test-token')

    await adapter.send({
      channelId: 'C_GENERAL',
      content: 'This is *emphasized* text',
    })

    expect(slackMocks.chatPostMessage).toHaveBeenCalledTimes(1)
    const call = (slackMocks.chatPostMessage.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0]
    expect(call.text).toBe('This is _emphasized_ text')
  })

  test('send() passes thread_ts for threaded replies', async () => {
    adapter.configure('xoxb-test-token')

    await adapter.send({
      channelId: 'C_GENERAL',
      content: 'Thread reply',
      threadId: '1700000001.000100',
    })

    expect(slackMocks.chatPostMessage).toHaveBeenCalledTimes(1)
    const call = (slackMocks.chatPostMessage.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0]
    expect(call.thread_ts).toBe('1700000001.000100')
  })

  test('send() truncates messages exceeding 39K chars', async () => {
    adapter.configure('xoxb-test-token')
    const longContent = 'a'.repeat(40_000)

    await adapter.send({
      channelId: 'C_GENERAL',
      content: longContent,
    })

    expect(slackMocks.chatPostMessage).toHaveBeenCalledTimes(1)
    const call = (slackMocks.chatPostMessage.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0]
    const text = call.text as string
    expect(text.length).toBeLessThan(40_000)
    expect(text).toContain('... (response truncated)')
  })

  test('send() does not truncate messages under 39K chars', async () => {
    adapter.configure('xoxb-test-token')
    const content = 'a'.repeat(38_000)

    await adapter.send({
      channelId: 'C_GENERAL',
      content,
    })

    expect(slackMocks.chatPostMessage).toHaveBeenCalledTimes(1)
    const call = (slackMocks.chatPostMessage.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0]
    const text = call.text as string
    expect(text).not.toContain('... (response truncated)')
  })

  test('send() throws if not configured', async () => {
    await expect(
      adapter.send({ channelId: 'C_GENERAL', content: 'test' }),
    ).rejects.toThrow('SlackChannelAdapter not configured')
  })

  test('start() does NOT create SocketModeClient when no appToken provided', async () => {
    adapter.configure('xoxb-test-token')
    await adapter.start(makeConfig(), () => {})

    expect(slackMocks.socketStart).not.toHaveBeenCalled()
    expect(slackMocks.socketEventHandlers.size).toBe(0)
  })

  test('start() creates and starts SocketModeClient when appToken provided', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token')
    await adapter.start(makeConfig(), () => {})

    expect(slackMocks.socketStart).toHaveBeenCalledTimes(1)
    expect(slackMocks.socketEventHandlers.has('slash_commands')).toBe(true)
    expect(adapter.isHealthy()).toBe(true)
  })

  test('slash command handler acknowledges and produces ChannelMessage', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    const handler = slackMocks.socketEventHandlers.get('slash_commands')!
    const ackFn = vi.fn(() => Promise.resolve())
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
    })

    expect(ackFn).toHaveBeenCalledTimes(1)
    expect(ackFn).toHaveBeenCalledWith({ text: 'Processing...' })
    expect(received).toHaveLength(1)
    const msg = received[0]!
    expect(msg.id).toBe('cmd-T123456')
    expect(msg.channelId).toBe('test-slack')
    expect(msg.source).toBe('U_ALICE')
    expect(msg.content).toBe('/kata ask about the deployment')
    expect(msg.metadata.command).toBe('/kata')
    expect(msg.metadata.triggerId).toBe('T123456')
    expect(msg.metadata.responseUrl).toBe('https://hooks.slack.com/commands/T_TEAM/resp')
    expect(msg.metadata.slackChannel).toBe('C_GENERAL')
    expect(msg.metadata.team).toBe('T_TEAM')
  })

  test('slash command with no text produces command-only content', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m) => received.push(m))

    const handler = slackMocks.socketEventHandlers.get('slash_commands')!
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
      ack: vi.fn(() => Promise.resolve()),
    })

    expect(received).toHaveLength(1)
    expect(received[0]!.content).toBe('/kata')
  })

  test('stop() disconnects SocketModeClient', async () => {
    adapter.configure('xoxb-test-token', undefined, 'xapp-test-app-token')
    await adapter.start(makeConfig(), () => {})

    expect(slackMocks.socketStart).toHaveBeenCalledTimes(1)

    await adapter.stop()

    expect(slackMocks.socketDisconnect).toHaveBeenCalledTimes(1)
    expect(adapter.isHealthy()).toBe(false)
  })

  test('stop() does not call disconnect when no socket client', async () => {
    adapter.configure('xoxb-test-token')
    await adapter.start(makeConfig(), () => {})

    await adapter.stop()

    expect(slackMocks.socketDisconnect).not.toHaveBeenCalled()
  })
})
