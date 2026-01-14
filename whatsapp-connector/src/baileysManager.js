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
const { writeIngest, threadId: makeThreadId, messageId: makeMessageId } = require('./ingest');
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
    // HARD GUARD: QR/pairing must never be stored in public doc.
    if (patch && (Object.prototype.hasOwnProperty.call(patch, 'qrCodeDataUrl') || Object.prototype.hasOwnProperty.call(patch, 'pairingCode'))) {
      throw new Error('qrCodeDataUrl/pairingCode must not be written to whatsapp_accounts public doc');
    }
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

  async _catchUp({ accountId, sock }) {
    // Best-effort catch-up after downtime:
    // - Use Firestore account cursor + recent threads list
    // - Fetch recent messages from WA and write them into WAL (idempotent)
    try {
      const db = getDb();
      const accSnap = await db.collection('whatsapp_accounts').doc(accountId).get();
      const acc = accSnap.data() || {};
      const gapStart = acc.syncGapStartAt;
      if (!gapStart) return;

      const threads = await db
        .collection('whatsapp_threads')
        .where('accountId', '==', accountId)
        .orderBy('lastMessageAt', 'desc')
        .limit(10)
        .get();

      for (const t of threads.docs) {
        const chatId = (t.data()?.chatId || '').toString();
        if (!chatId) continue;
        // Baileys API: fetchMessagesFromWA(jid, count, cursor?)
        if (typeof sock.fetchMessagesFromWA !== 'function') continue;
        const msgs = await sock.fetchMessagesFromWA(chatId, 50);
        for (const m of msgs || []) {
          await writeIngest({ accountId, msg: m });
        }
      }

      const admin = getAdmin();
      await db.collection('whatsapp_accounts').doc(accountId).set(
        {
          syncGapEndAt: admin.firestore.FieldValue.serverTimestamp(),
          syncGapStartAt: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (e) {
      this.log('warn', 'catchup_failed', { accountId, err: String(e) });
    }
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

    // Delivery receipts -> update whatsapp_messages.delivery (server-only)
    sock.ev.on('message-receipt.update', async (receipts) => {
      try {
        const db = getDb();
        const admin = getAdmin();
        for (const r of receipts || []) {
          const key = r?.key;
          const waMessageKey = (key?.id || '').toString();
          const chatId = (key?.remoteJid || '').toString();
          if (!waMessageKey || !chatId) continue;

          const tId = makeThreadId({ accountId, chatId });
          const waMessageId = makeMessageId({ threadId: tId, waMessageKey });

          const status = (r?.receipt?.status || '').toString(); // delivered|read|played
          const delivery =
            status === 'read' ? 'read' : status === 'delivered' ? 'delivered' : status === 'played' ? 'read' : null;
          if (!delivery) continue;

          await db.collection('whatsapp_messages').doc(waMessageId).set(
            {
              delivery,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (e) {
        this.log('warn', 'receipt_update_error', { accountId, err: String(e) });
      }
    });

    // messages.update can contain status codes; map best-effort
    sock.ev.on('messages.update', async (updates) => {
      try {
        const db = getDb();
        const admin = getAdmin();
        for (const u of updates || []) {
          const key = u?.key;
          const waMessageKey = (key?.id || '').toString();
          const chatId = (key?.remoteJid || '').toString();
          if (!waMessageKey || !chatId) continue;
          const tId = makeThreadId({ accountId, chatId });
          const waMessageId = makeMessageId({ threadId: tId, waMessageKey });

          const st = u?.update?.status;
          // Common Baileys statuses: 1 sent, 2 delivered, 3 read
          const delivery = st === 3 ? 'read' : st === 2 ? 'delivered' : st === 1 ? 'sent' : null;
          if (!delivery) continue;

          await db.collection('whatsapp_messages').doc(waMessageId).set(
            {
              delivery,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (e) {
        this.log('warn', 'messages_update_error', { accountId, err: String(e) });
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
            syncGapEndAt: getAdmin().firestore.FieldValue.serverTimestamp(),
          });
          await this._clearPrivateQr(accountId);

          // Catch-up on reconnect (best-effort)
          this._catchUp({ accountId, sock }).catch(() => {});

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
            syncGapStartAt: getAdmin().firestore.FieldValue.serverTimestamp(),
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

