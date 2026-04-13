import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ChannelConfig, ChannelMessage } from '../types.ts'
import type { WhatsAppChannelAdapter as WhatsAppType } from '../adapters/whatsapp-adapter.ts'

type EventHandler = (...args: unknown[]) => void

const whatsappMocks = vi.hoisted(() => ({
  eventHandlers: new Map<string, EventHandler[]>(),
  end: vi.fn(() => {}),
  saveCreds: vi.fn(() => Promise.resolve()),
}))

vi.mock('@whiskeysockets/baileys', () => ({
  default: function makeWASocket() {
    whatsappMocks.eventHandlers = new Map()
    whatsappMocks.end = vi.fn(() => {})
    return {
      ev: {
        on(event: string, handler: EventHandler) {
          const handlers = whatsappMocks.eventHandlers.get(event) ?? []
          handlers.push(handler)
          whatsappMocks.eventHandlers.set(event, handlers)
        },
      },
      end: whatsappMocks.end,
    }
  },
  useMultiFileAuthState: () =>
    Promise.resolve({
      state: { creds: {}, keys: {} },
      saveCreds: whatsappMocks.saveCreds,
    }),
  makeCacheableSignalKeyStore: (keys: unknown) => keys,
  DisconnectReason: { loggedOut: 401 },
}))

vi.mock('@hapi/boom', () => ({
  Boom: class Boom extends Error {
    output: { statusCode: number }
    constructor(message?: string, options?: { statusCode?: number }) {
      super(message)
      this.output = { statusCode: options?.statusCode ?? 500 }
    }
  },
}))

vi.mock('pino', () => ({
  default: () => ({}),
}))

const { WhatsAppChannelAdapter } = await import('../adapters/whatsapp-adapter.ts')

function makeConfig(overrides?: Partial<ChannelConfig>): ChannelConfig {
  return {
    slug: 'test-whatsapp',
    enabled: true,
    adapter: 'whatsapp',
    credentials: { sourceSlug: 'wa-creds' },
    ...overrides,
  }
}

function fireEvent(event: string, ...args: unknown[]) {
  const handlers = whatsappMocks.eventHandlers.get(event) ?? []
  for (const handler of handlers) {
    handler(...args)
  }
}

describe('WhatsAppChannelAdapter', () => {
  let adapter: WhatsAppType

  beforeEach(() => {
    adapter = new WhatsAppChannelAdapter()
    whatsappMocks.saveCreds.mockClear()
    whatsappMocks.eventHandlers = new Map()
  })

  afterEach(async () => {
    await adapter.stop()
  })

  test('adapter name and type are correct', () => {
    expect(adapter.name).toBe('WhatsApp')
    expect(adapter.type).toBe('subscribe')
  })

  test('start() throws if configure() was not called', async () => {
    const onMessage = vi.fn(() => {})
    await expect(adapter.start(makeConfig(), onMessage)).rejects.toThrow(
      'configure() must be called before start()',
    )
  })

  test('start() creates socket with auth state but is not healthy until connection opens', async () => {
    adapter.configure('/tmp/test-auth')
    const onMessage = vi.fn(() => {})

    await adapter.start(makeConfig(), onMessage)

    expect(adapter.id).toBe('test-whatsapp')
    expect(adapter.isHealthy()).toBe(false)
    expect(whatsappMocks.eventHandlers.has('connection.update')).toBe(true)
    expect(whatsappMocks.eventHandlers.has('messages.upsert')).toBe(true)
    expect(whatsappMocks.eventHandlers.has('creds.update')).toBe(true)
  })

  test('messages.upsert handler skips fromMe messages', async () => {
    adapter.configure('/tmp/test-auth')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m))

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: true },
          message: { conversation: 'my own message' },
          messageTimestamp: 1700000001,
        },
      ],
    })

    expect(received).toHaveLength(0)
  })

  test('messages.upsert handler skips messages without content', async () => {
    adapter.configure('/tmp/test-auth')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m))

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: false },
          message: null,
          messageTimestamp: 1700000001,
        },
      ],
    })

    expect(received).toHaveLength(0)
  })

  test('messages.upsert handler skips non-notify type', async () => {
    adapter.configure('/tmp/test-auth')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m))

    fireEvent('messages.upsert', {
      type: 'append',
      messages: [
        {
          key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: false },
          message: { conversation: 'hello' },
          messageTimestamp: 1700000001,
        },
      ],
    })

    expect(received).toHaveLength(0)
  })

  test('messages.upsert handler converts conversation text to ChannelMessage', async () => {
    adapter.configure('/tmp/test-auth')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m))

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-42', remoteJid: '5551234@s.whatsapp.net', fromMe: false, participant: undefined },
          message: { conversation: 'hello from whatsapp' },
          messageTimestamp: 1700000010,
        },
      ],
    })

    expect(received).toHaveLength(1)
    const cm = received[0]!
    expect(cm.id).toBe('msg-42')
    expect(cm.channelId).toBe('test-whatsapp')
    expect(cm.source).toBe('5551234@s.whatsapp.net')
    expect(cm.timestamp).toBe(1700000010000)
    expect(cm.content).toBe('hello from whatsapp')
    expect(cm.metadata).toEqual({ jid: '5551234@s.whatsapp.net', participant: undefined })
    expect(cm.replyTo).toBeUndefined()
  })

  test('messages.upsert handler extracts text from extendedTextMessage', async () => {
    adapter.configure('/tmp/test-auth')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m))

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-99', remoteJid: '5559999@s.whatsapp.net', fromMe: false, participant: 'part-1' },
          message: {
            extendedTextMessage: {
              text: 'extended text content',
              contextInfo: { stanzaId: 'reply-to-msg-50' },
            },
          },
          messageTimestamp: 1700000020,
        },
      ],
    })

    expect(received).toHaveLength(1)
    const cm = received[0]!
    expect(cm.content).toBe('extended text content')
    expect(cm.metadata).toEqual({ jid: '5559999@s.whatsapp.net', participant: 'part-1' })
    expect(cm.replyTo).toEqual({
      threadId: '5559999@s.whatsapp.net',
      messageId: 'reply-to-msg-50',
    })
  })

  test('messages.upsert handler skips messages with no text', async () => {
    adapter.configure('/tmp/test-auth')
    const received: ChannelMessage[] = []
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m))

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-img', remoteJid: '5551111@s.whatsapp.net', fromMe: false },
          message: { imageMessage: { url: 'https://example.com/img.jpg' } },
          messageTimestamp: 1700000030,
        },
      ],
    })

    expect(received).toHaveLength(0)
  })

  test('connection.update handler sets healthy on open', async () => {
    adapter.configure('/tmp/test-auth')
    await adapter.start(makeConfig(), () => {})

    fireEvent('connection.update', { connection: 'open' })

    expect(adapter.isHealthy()).toBe(true)
    expect(adapter.getLastError()).toBeNull()
  })

  test('connection.update handler sets unhealthy on close', async () => {
    adapter.configure('/tmp/test-auth')
    await adapter.start(makeConfig(), () => {})

    const error = new Error('logged out') as Error & { output?: { statusCode: number } }
    error.output = { statusCode: 401 }
    fireEvent('connection.update', {
      connection: 'close',
      lastDisconnect: { error },
    })

    expect(adapter.isHealthy()).toBe(false)
    expect(adapter.getLastError()).toBe('logged out')
  })

  test('connection.update close with non-logout triggers reconnect attempt', async () => {
    adapter.configure('/tmp/test-auth')
    await adapter.start(makeConfig(), () => {})

    fireEvent('connection.update', { connection: 'open' })
    expect(adapter.isHealthy()).toBe(true)

    const error = new Error('connection lost') as Error & { output?: { statusCode: number } }
    error.output = { statusCode: 500 }
    fireEvent('connection.update', {
      connection: 'close',
      lastDisconnect: { error },
    })

    expect(adapter.isHealthy()).toBe(false)
    expect(adapter.getLastError()).toBe('connection lost')
    expect(whatsappMocks.end).toHaveBeenCalled()
  })

  test('connection.update handler invokes QR callback', async () => {
    const qrData: string[] = []
    adapter.configure('/tmp/test-auth', (qr: string) => qrData.push(qr))
    await adapter.start(makeConfig(), () => {})

    fireEvent('connection.update', { qr: 'QR_CODE_DATA_HERE' })

    expect(qrData).toHaveLength(1)
    expect(qrData[0]).toBe('QR_CODE_DATA_HERE')
  })

  test('creds.update handler calls saveCreds', async () => {
    adapter.configure('/tmp/test-auth')
    await adapter.start(makeConfig(), () => {})

    fireEvent('creds.update')

    expect(whatsappMocks.saveCreds).toHaveBeenCalledTimes(1)
  })

  test('stop() calls end and sets healthy to false', async () => {
    adapter.configure('/tmp/test-auth')
    await adapter.start(makeConfig(), () => {})

    fireEvent('connection.update', { connection: 'open' })
    expect(adapter.isHealthy()).toBe(true)

    await adapter.stop()

    expect(adapter.isHealthy()).toBe(false)
    expect(whatsappMocks.end).toHaveBeenCalledTimes(1)
  })

  test('getLastError() returns null when healthy', async () => {
    adapter.configure('/tmp/test-auth')
    await adapter.start(makeConfig(), () => {})

    expect(adapter.getLastError()).toBeNull()
  })
})
