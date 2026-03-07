import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import type { ChannelConfig, ChannelMessage } from '../types.ts';
import type { WhatsAppChannelAdapter as WhatsAppType } from '../adapters/whatsapp-adapter.ts';

// Event handler storage for the mock socket
type EventHandler = (...args: unknown[]) => void;
let eventHandlers: Map<string, EventHandler[]>;
let mockEnd: ReturnType<typeof mock>;

// Mock saveCreds
const mockSaveCreds = mock(() => Promise.resolve());

// Mock Baileys module
mock.module('@whiskeysockets/baileys', () => {
  return {
    default: function makeWASocket() {
      eventHandlers = new Map();
      mockEnd = mock(() => {});
      return {
        ev: {
          on(event: string, handler: EventHandler) {
            const handlers = eventHandlers.get(event) ?? [];
            handlers.push(handler);
            eventHandlers.set(event, handlers);
          },
        },
        end: mockEnd,
      };
    },
    useMultiFileAuthState: () =>
      Promise.resolve({
        state: { creds: {}, keys: {} },
        saveCreds: mockSaveCreds,
      }),
    makeCacheableSignalKeyStore: (keys: unknown) => keys,
    DisconnectReason: { loggedOut: 401 },
  };
});

mock.module('@hapi/boom', () => ({
  Boom: class Boom extends Error {
    output: { statusCode: number };
    constructor(message?: string, options?: { statusCode?: number }) {
      super(message);
      this.output = { statusCode: options?.statusCode ?? 500 };
    }
  },
}));

mock.module('pino', () => ({
  default: () => ({}),
}));

// Import after mocks are registered
const { WhatsAppChannelAdapter } = await import('../adapters/whatsapp-adapter.ts');

function makeConfig(overrides?: Partial<ChannelConfig>): ChannelConfig {
  return {
    slug: 'test-whatsapp',
    enabled: true,
    adapter: 'whatsapp',
    credentials: { sourceSlug: 'wa-creds' },
    ...overrides,
  };
}

function fireEvent(event: string, ...args: unknown[]) {
  const handlers = eventHandlers.get(event) ?? [];
  for (const handler of handlers) {
    handler(...args);
  }
}

describe('WhatsAppChannelAdapter', () => {
  let adapter: WhatsAppType;

  beforeEach(() => {
    adapter = new WhatsAppChannelAdapter();
    mockSaveCreds.mockClear();
  });

  afterEach(async () => {
    await adapter.stop();
  });

  test('adapter name and type are correct', () => {
    expect(adapter.name).toBe('WhatsApp');
    expect(adapter.type).toBe('subscribe');
  });

  test('start() throws if configure() was not called', async () => {
    const onMessage = mock(() => {});
    await expect(adapter.start(makeConfig(), onMessage)).rejects.toThrow(
      'configure() must be called before start()',
    );
  });

  test('start() creates socket with auth state but is not healthy until connection opens', async () => {
    adapter.configure('/tmp/test-auth');
    const onMessage = mock(() => {});

    await adapter.start(makeConfig(), onMessage);

    expect(adapter.id).toBe('test-whatsapp');
    expect(adapter.isHealthy()).toBe(false);
    expect(eventHandlers.has('connection.update')).toBe(true);
    expect(eventHandlers.has('messages.upsert')).toBe(true);
    expect(eventHandlers.has('creds.update')).toBe(true);
  });

  test('messages.upsert handler skips fromMe messages', async () => {
    adapter.configure('/tmp/test-auth');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m));

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: true },
          message: { conversation: 'my own message' },
          messageTimestamp: 1700000001,
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  test('messages.upsert handler skips messages without content', async () => {
    adapter.configure('/tmp/test-auth');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m));

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: false },
          message: null,
          messageTimestamp: 1700000001,
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  test('messages.upsert handler skips non-notify type', async () => {
    adapter.configure('/tmp/test-auth');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m));

    fireEvent('messages.upsert', {
      type: 'append',
      messages: [
        {
          key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: false },
          message: { conversation: 'hello' },
          messageTimestamp: 1700000001,
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  test('messages.upsert handler converts conversation text to ChannelMessage', async () => {
    adapter.configure('/tmp/test-auth');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m));

    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-42', remoteJid: '5551234@s.whatsapp.net', fromMe: false, participant: undefined },
          message: { conversation: 'hello from whatsapp' },
          messageTimestamp: 1700000010,
        },
      ],
    });

    expect(received).toHaveLength(1);
    const cm = received[0]!;
    expect(cm.id).toBe('msg-42');
    expect(cm.channelId).toBe('test-whatsapp');
    expect(cm.source).toBe('5551234@s.whatsapp.net');
    expect(cm.timestamp).toBe(1700000010000);
    expect(cm.content).toBe('hello from whatsapp');
    expect(cm.metadata).toEqual({ jid: '5551234@s.whatsapp.net', participant: undefined });
    expect(cm.replyTo).toBeUndefined();
  });

  test('messages.upsert handler extracts text from extendedTextMessage', async () => {
    adapter.configure('/tmp/test-auth');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m));

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
    });

    expect(received).toHaveLength(1);
    const cm = received[0]!;
    expect(cm.content).toBe('extended text content');
    expect(cm.metadata).toEqual({ jid: '5559999@s.whatsapp.net', participant: 'part-1' });
    expect(cm.replyTo).toEqual({
      threadId: '5559999@s.whatsapp.net',
      messageId: 'reply-to-msg-50',
    });
  });

  test('messages.upsert handler skips messages with no text', async () => {
    adapter.configure('/tmp/test-auth');
    const received: ChannelMessage[] = [];
    await adapter.start(makeConfig(), (m: ChannelMessage) => received.push(m));

    // Message with an image but no text
    fireEvent('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: 'msg-img', remoteJid: '5551111@s.whatsapp.net', fromMe: false },
          message: { imageMessage: { url: 'https://example.com/img.jpg' } },
          messageTimestamp: 1700000030,
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  test('connection.update handler sets healthy on open', async () => {
    adapter.configure('/tmp/test-auth');
    await adapter.start(makeConfig(), () => {});

    // Simulate connection open
    fireEvent('connection.update', { connection: 'open' });

    expect(adapter.isHealthy()).toBe(true);
    expect(adapter.getLastError()).toBeNull();
  });

  test('connection.update handler sets unhealthy on close', async () => {
    adapter.configure('/tmp/test-auth');
    await adapter.start(makeConfig(), () => {});

    // Simulate close with loggedOut reason (no reconnect)
    const error = new Error('logged out');
    (error as any).output = { statusCode: 401 };
    fireEvent('connection.update', {
      connection: 'close',
      lastDisconnect: { error },
    });

    expect(adapter.isHealthy()).toBe(false);
    expect(adapter.getLastError()).toBe('logged out');
  });

  test('connection.update close with non-logout triggers reconnect attempt', async () => {
    adapter.configure('/tmp/test-auth');
    await adapter.start(makeConfig(), () => {});

    // Simulate connection open first
    fireEvent('connection.update', { connection: 'open' });
    expect(adapter.isHealthy()).toBe(true);

    // Simulate close with non-logout status code (should reconnect)
    const error = new Error('connection lost');
    (error as any).output = { statusCode: 500 };
    fireEvent('connection.update', {
      connection: 'close',
      lastDisconnect: { error },
    });

    expect(adapter.isHealthy()).toBe(false);
    expect(adapter.getLastError()).toBe('connection lost');
    // Socket end should have been called to clean up old socket
    expect(mockEnd).toHaveBeenCalled();
  });

  test('connection.update handler invokes QR callback', async () => {
    const qrData: string[] = [];
    adapter.configure('/tmp/test-auth', (qr: string) => qrData.push(qr));
    await adapter.start(makeConfig(), () => {});

    fireEvent('connection.update', { qr: 'QR_CODE_DATA_HERE' });

    expect(qrData).toHaveLength(1);
    expect(qrData[0]).toBe('QR_CODE_DATA_HERE');
  });

  test('creds.update handler calls saveCreds', async () => {
    adapter.configure('/tmp/test-auth');
    await adapter.start(makeConfig(), () => {});

    fireEvent('creds.update');

    expect(mockSaveCreds).toHaveBeenCalledTimes(1);
  });

  test('stop() calls end and sets healthy to false', async () => {
    adapter.configure('/tmp/test-auth');
    await adapter.start(makeConfig(), () => {});

    // Simulate connection open to set healthy
    fireEvent('connection.update', { connection: 'open' });
    expect(adapter.isHealthy()).toBe(true);

    await adapter.stop();

    expect(adapter.isHealthy()).toBe(false);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  test('getLastError() returns null when healthy', async () => {
    adapter.configure('/tmp/test-auth');
    await adapter.start(makeConfig(), () => {});

    expect(adapter.getLastError()).toBeNull();
  });
});
