/**
 * WhatsApp Channel Adapter
 *
 * Subscribe-based adapter using Baileys (WhatsApp Web API).
 * Holds a persistent WebSocket connection, filters self-messages,
 * and converts incoming messages to ChannelMessage format.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import type { ChannelAdapter, ChannelConfig, ChannelMessage, OutboundMessage } from '../types.ts';

/** Callback for QR code data (base64 or terminal string) */
export type QrCallback = (qr: string) => void;

/**
 * WhatsApp channel adapter using Baileys WebSocket connection.
 * Requires configure() before start().
 */
export class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly name = 'WhatsApp';
  readonly type = 'subscribe' as const;

  private _id = '';
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private healthy = false;
  private lastErrorMsg: string | null = null;
  private authStatePath: string | null = null;
  private qrCallback: QrCallback | null = null;
  private stopping = false;
  private reconnectAttempts = 0;
  private maxReconnects = 5;
  private reconnectDelayMs = 1000;

  get id(): string {
    return this._id;
  }

  /**
   * Configure the adapter with the path for Baileys auth state persistence.
   * Optionally provide a callback to receive QR code data for pairing.
   */
  configure(authStatePath: string, onQr?: QrCallback): void {
    this.authStatePath = authStatePath;
    this.qrCallback = onQr ?? null;
  }

  async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void> {
    if (!this.authStatePath) {
      throw new Error('WhatsAppChannelAdapter.configure() must be called before start()');
    }

    this._id = config.slug;
    this.stopping = false;

    const logger = pino({ level: 'silent' });
    const { state, saveCreds } = await useMultiFileAuthState(this.authStatePath);

    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.qrCallback) {
        this.qrCallback(qr);
      }

      if (connection === 'open') {
        this.healthy = true;
        this.lastErrorMsg = null;
        this.reconnectAttempts = 0;
      }

      if (connection === 'close') {
        this.healthy = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect && !this.stopping) {
          this.lastErrorMsg = lastDisconnect?.error?.message ?? 'connection closed';
          this.sock?.end(undefined);

          if (this.reconnectAttempts >= this.maxReconnects) {
            this.lastErrorMsg = `max reconnect attempts (${this.maxReconnects}) exceeded`;
            return;
          }

          const delay = Math.min(this.reconnectDelayMs * 2 ** this.reconnectAttempts, 30_000);
          this.reconnectAttempts++;
          setTimeout(() => {
            this.start(config, onMessage).catch((err) => {
              this.lastErrorMsg = err instanceof Error ? err.message : String(err);
            });
          }, delay);
        } else {
          this.lastErrorMsg = 'logged out';
        }
      }
    });

    this.sock.ev.on('messages.upsert', (event) => {
      if (event.type !== 'notify') return;

      for (const msg of event.messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const text =
          msg.message.conversation ?? msg.message.extendedTextMessage?.text;
        if (!text) continue;

        const channelMessage: ChannelMessage = {
          id: msg.key.id!,
          channelId: this._id,
          source: msg.key.remoteJid!,
          timestamp: (msg.messageTimestamp as number) * 1000,
          content: text,
          metadata: {
            jid: msg.key.remoteJid,
            participant: msg.key.participant,
          },
          replyTo: msg.message.extendedTextMessage?.contextInfo?.stanzaId
            ? {
                threadId: msg.key.remoteJid!,
                messageId: msg.message.extendedTextMessage.contextInfo.stanzaId,
              }
            : undefined,
        };

        onMessage(channelMessage);
      }
    });

    this.sock.ev.on('creds.update', saveCreds);
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.sock) throw new Error('WhatsAppChannelAdapter not connected');
    await this.sock.sendMessage(message.channelId, { text: message.content });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.sock?.end(undefined);
    this.sock = null;
    this.healthy = false;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  getLastError(): string | null {
    return this.lastErrorMsg;
  }
}
