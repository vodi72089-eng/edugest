import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import pino from 'pino';

const logger = pino({ level: 'silent' });
const AUTH_DIR = path.resolve(process.cwd(), 'whatsapp-auth');

let sock: WASocket | null = null;
let qrCode: string | null = null;
let connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
let onQRCallback: ((qr: string) => void) | null = null;
let onStatusCallback: ((status: string) => void) | null = null;

export function getWhatsAppStatus() {
  return { status: connectionStatus, qr: qrCode };
}

export function onQR(callback: (qr: string) => void) {
  onQRCallback = callback;
}

export function onStatus(callback: (status: string) => void) {
  onStatusCallback = callback;
}

export async function startWhatsApp(): Promise<void> {
  if (sock) return;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    logger: logger as any,
    printQRInTerminal: true,
    browser: ['EduGest', 'Safari', '3.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      connectionStatus = 'connecting';
      console.log('[WhatsApp] QR code received. Scan with your phone.');
      onQRCallback?.(qr);
      onStatusCallback?.('connecting');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log('[WhatsApp] Connection closed. Reason:', reason);

      if (reason !== DisconnectReason.loggedOut) {
        console.log('[WhatsApp] Reconnecting...');
        sock = null;
        qrCode = null;
        connectionStatus = 'disconnected';
        onStatusCallback?.('disconnected');
        setTimeout(() => startWhatsApp(), 3000);
      } else {
        console.log('[WhatsApp] Logged out. Need to scan QR again.');
        sock = null;
        qrCode = null;
        connectionStatus = 'disconnected';
        onStatusCallback?.('disconnected');
      }
    }

    if (connection === 'open') {
      qrCode = null;
      connectionStatus = 'connected';
      console.log('[WhatsApp] Connected!');
      onStatusCallback?.('connected');
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message?.conversation) {
        console.log(`[WhatsApp] Received: ${msg.message.conversation} from ${msg.key.remoteJid}`);
      }
    }
  });
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  if (!sock || connectionStatus !== 'connected') {
    console.warn('[WhatsApp] Not connected. Cannot send message.');
    return false;
  }

  try {
    // Format phone: ensure it has @s.whatsapp.net suffix
    const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

    await sock.sendMessage(jid, { text: message });
    console.log('[WhatsApp] Message sent to:', phone);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Send failed:', error);
    return false;
  }
}

export async function logoutWhatsApp(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
    qrCode = null;
    connectionStatus = 'disconnected';
    onStatusCallback?.('disconnected');
  }
}
