const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');

const { getDb, getAdmin } = require('./firestore');
const { writeIngest } = require('./ingest');
const { computeReconnectDelayMs } = require('./reconnectPolicy');

function stableHash(str) {
  // Simple FNV-1a 32-bit
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class BaileysManager {
  constructor({ instanceId, sessionsPath, maxAccounts = 30, shardCount = 1, shardIndex = 0, log }) {
    this.instanceId = instanceId;
    this.sessionsPath = sessionsPath;
    this.maxAccounts = maxAccounts;
    this.shardCount = shardCount;
    this.shardIndex = shardIndex;
    this.log = log || (() => {});

    /** @type {Map<string, any>} */
    this._accounts = new Map();
  }

  isResponsible(accountId) {
    if (!this.shardCount || this.shardCount <= 1) return true;
    return stableHash(accountId) % this.shardCount === this.shardIndex;
  }

  isRunning(accountId) {
    return this._accounts.has(accountId);
  }

  async _setAccountPublic(accountId, patch) {
    const db = getDb();
    const admin = getAdmin();
    await db
      .collection('whatsapp_accounts')
      .doc(accountId)
      .set(
        {
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          assignedWorkerId: this.instanceId,
        },
        { merge: true },
      );
  }

  async _setAccountPrivate(accountId, patch) {
    const db = getDb();
    const admin = getAdmin();
    await db
      .collection('whatsapp_accounts')
      .doc(accountId)
      .collection('private')
      .doc('state')
      .set(
        {
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  async _clearPrivateQr(accountId) {
    await this._setAccountPrivate(accountId, { qrCodeDataUrl: null, pairingCode: null });
  }

  async startAccount({ accountId }) {
    if (!accountId) return;
    if (!this.isResponsible(accountId)) return;
    if (this.isRunning(accountId)) return;
    if (this._accounts.size >= this.maxAccounts) {
      this.log('warn', 'max_accounts_reached', { max: this.maxAccounts });
      return;
    }

    const accountDir = path.join(this.sessionsPath, accountId);
    fs.mkdirSync(accountDir, { recursive: true });

    const stopSignal = { stopped: false };
    const runtime = {
      accountId,
      stopSignal,
      socket: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      heartbeatTimer: null,
      state: 'starting',
    };
    this._accounts.set(accountId, runtime);

    await this._setAccountPublic(accountId, {
      status: 'disconnected',
      lastError: null,
      disconnectReason: null,
    });

    await this._connect(runtime);
  }

  async regenerateQr(accountId) {
    // Best-effort: wipe session folder and reconnect.
    const accountDir = path.join(this.sessionsPath, accountId);
    try {
      fs.rmSync(accountDir, { recursive: true, force: true });
    } catch (_) {}
    await this.stopAccount(accountId);
    await this.startAccount({ accountId });
  }

  async stopAccount(accountId) {
    const rt = this._accounts.get(accountId);
    if (!rt) return;
    rt.stopSignal.stopped = true;
    if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
    if (rt.heartbeatTimer) clearInterval(rt.heartbeatTimer);
    try {
      rt.socket?.end?.(new Error('stop'));
    } catch (_) {}
    this._accounts.delete(accountId);
  }

  async _connect(rt) {
    const { accountId } = rt;
    if (rt.stopSignal.stopped) return;

    rt.reconnectAttempts += 1;
    rt.state = 'connecting';

    const accountDir = path.join(this.sessionsPath, accountId);
    const { state, saveCreds } = await useMultiFileAuthState(accountDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
    });

    rt.socket = sock;
    sock.ev.on('creds.update', saveCreds);

    // Inbound messages -> WAL
    sock.ev.on('messages.upsert', async (m) => {
      try {
        const type = m?.type;
        const msgs = Array.isArray(m?.messages) ? m.messages : [];
        if (type !== 'notify') return;
        for (const msg of msgs) {
          if (rt.stopSignal.stopped) return;
          await writeIngest({ accountId, msg });
        }
      } catch (e) {
        this.log('warn', 'messages_upsert_error', { accountId, err: String(e) });
      }
    });

    sock.ev.on('connection.update', async (u) => {
      try {
        if (rt.stopSignal.stopped) return;

        if (u.qr) {
          const qrCodeDataUrl = await qrcode.toDataURL(u.qr);
          await this._setAccountPublic(accountId, {
            status: 'qr_ready',
            lastError: null,
            disconnectReason: null,
          });
          await this._setAccountPrivate(accountId, {
            qrCodeDataUrl,
            pairingCode: null,
          });
        }

        if (u.connection === 'open') {
          rt.reconnectAttempts = 0;
          rt.state = 'connected';
          await this._setAccountPublic(accountId, {
            status: 'connected',
            lastError: null,
            disconnectReason: null,
          });
          await this._clearPrivateQr(accountId);

          if (!rt.heartbeatTimer) {
            rt.heartbeatTimer = setInterval(() => {
              this._setAccountPublic(accountId, {}).catch(() => {});
            }, 15_000);
          }
        }

        if (u.connection === 'close') {
          rt.state = 'disconnected';
          if (rt.heartbeatTimer) {
            clearInterval(rt.heartbeatTimer);
            rt.heartbeatTimer = null;
          }

          const reasonCode =
            u?.lastDisconnect?.error?.output?.statusCode ||
            u?.lastDisconnect?.error?.statusCode ||
            null;

          const reason =
            reasonCode === DisconnectReason.loggedOut
              ? 'logged_out'
              : reasonCode === DisconnectReason.connectionClosed
                ? 'connection_closed'
                : reasonCode === DisconnectReason.connectionLost
                  ? 'connection_lost'
                  : reasonCode === DisconnectReason.timedOut
                    ? 'timed_out'
                    : 'unknown';

          await this._setAccountPublic(accountId, {
            status: reason === 'logged_out' ? 'qr_ready' : 'disconnected',
            disconnectReason: reason,
            lastError: u?.lastDisconnect?.error ? String(u.lastDisconnect.error) : null,
          });

          if (reason === 'logged_out') {
            // force QR by wiping session and reconnecting
            await this.regenerateQr(accountId);
            return;
          }

          // transient -> fast reconnect (1-3s, then backoff)
          const delay = computeReconnectDelayMs({ attempt: rt.reconnectAttempts });
          if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
          rt.reconnectTimer = setTimeout(() => {
            this._connect(rt).catch((e) =>
              this.log('error', 'reconnect_error', { accountId, err: String(e) }),
            );
          }, delay);
        }
      } catch (e) {
        this.log('error', 'connection_update_error', { accountId, err: String(e) });
      }
    });
  }

  async sendText({ accountId, chatId, to, text }) {
    const rt = this._accounts.get(accountId);
    if (!rt || !rt.socket) throw new Error(`account_not_running:${accountId}`);
    const jid = (chatId || to || '').toString();
    if (!jid) throw new Error('missing_to');
    if (!text) throw new Error('missing_text');

    const res = await rt.socket.sendMessage(jid, { text: String(text) });
    const waMessageKey = res?.key?.id || null;
    return {
      waMessageKey,
      timestamp: res?.messageTimestamp || null,
    };
  }
}

module.exports = {
  BaileysManager,
};

