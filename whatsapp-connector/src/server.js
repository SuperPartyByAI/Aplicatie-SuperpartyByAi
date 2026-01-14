require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const express = require('express');
const cors = require('cors');

const { initFirebase, getAdmin, getDb } = require('./firestore');
const { claimLease, renewLease, releaseLease } = require('./lease');
const { BaileysManager } = require('./baileysManager');
const { runIngestProcessorLoop, threadId: makeThreadId } = require('./ingest');
const { enqueueOutbox, runOutboxLoop } = require('./outboxWorker');

const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';

function isSuperAdminEmail(email) {
  return (email || '').toString().trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

function log(level, msg, meta) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  });
  // eslint-disable-next-line no-console
  console.log(line);
}

function envInt(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : def;
}

function getInstanceId() {
  const v = (process.env.INSTANCE_ID || '').trim();
  if (v) return v;
  return `inst_${crypto.randomUUID()}`;
}

async function verifyIdToken(req) {
  const admin = getAdmin();
  const h = (req.headers.authorization || '').toString();
  const token = h.startsWith('Bearer ') ? h.substring('Bearer '.length).trim() : '';
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (_) {
    return null;
  }
}

async function main() {
  initFirebase();

  const instanceId = getInstanceId();
  const port = envInt('PORT', 8080);
  const maxAccounts = envInt('MAX_ACCOUNTS', 30);
  const leaseMs = envInt('LEASE_MS', 25_000);
  const renewEveryMs = envInt('LEASE_RENEW_EVERY_MS', 15_000);
  const shardCount = envInt('SHARD_COUNT', 1);
  const shardIndex = envInt('SHARD_INDEX', 0);

  const sessionsPath = (process.env.SESSIONS_PATH || '').trim() || path.join(__dirname, '..', '.sessions');
  fs.mkdirSync(sessionsPath, { recursive: true });

  log('info', 'boot', { instanceId, port, sessionsPath, maxAccounts, shardCount, shardIndex });

  const stopSignal = { stopped: false };

  const manager = new BaileysManager({
    instanceId,
    sessionsPath,
    maxAccounts,
    shardCount,
    shardIndex,
    log,
  });

  // Background loops: WAL processor + outbox sender
  runIngestProcessorLoop({ stopSignal, log }).catch((e) => log('error', 'ingest_loop_crash', { err: String(e) }));
  runOutboxLoop({
    stopSignal,
    instanceId,
    log,
    sendFn: async ({ accountId, chatId, to, text }) => {
      const res = await manager.sendText({ accountId, chatId, to, text });
      return { waMessageKey: res.waMessageKey, timestamp: res.timestamp };
    },
  }).catch((e) => log('error', 'outbox_loop_crash', { err: String(e) }));

  // Lease renew timers per account
  const leaseTimers = new Map();

  async function ensureLeaseAndRun(accountId) {
    if (!manager.isResponsible(accountId)) return;

    const claim = await claimLease({ accountId, instanceId, leaseMs });
    if (!claim.ok) {
      if (manager.isRunning(accountId)) {
        await manager.stopAccount(accountId);
      }
      return;
    }

    if (!manager.isRunning(accountId)) {
      await manager.startAccount({ accountId });
    }

    if (!leaseTimers.has(accountId)) {
      const t = setInterval(async () => {
        const r = await renewLease({ accountId, instanceId, leaseMs });
        if (!r.ok) {
          log('warn', 'lease_lost', { accountId, reason: r.reason });
          clearInterval(t);
          leaseTimers.delete(accountId);
          await manager.stopAccount(accountId);
          await releaseLease({ accountId, instanceId });
        }
      }, renewEveryMs);
      leaseTimers.set(accountId, t);
    }
  }

  async function stopAccountFully(accountId) {
    if (leaseTimers.has(accountId)) {
      clearInterval(leaseTimers.get(accountId));
      leaseTimers.delete(accountId);
    }
    await manager.stopAccount(accountId);
    await releaseLease({ accountId, instanceId });
  }

  async function supervisorTick() {
    const db = getDb();

    // NOTE: no "!=" query in Firestore rules; just fetch a bounded set.
    const snap = await db.collection('whatsapp_accounts').limit(200).get();
    const desired = new Set();

    for (const doc of snap.docs) {
      const aId = doc.id;
      const data = doc.data() || {};
      const desiredState = (data.desiredState || 'connected').toString();
      if (desiredState === 'paused') {
        continue;
      }
      desired.add(aId);
      await ensureLeaseAndRun(aId);
    }

    // Stop accounts no longer desired
    for (const aId of Array.from(manager._accounts.keys())) {
      if (!desired.has(aId)) {
        await stopAccountFully(aId);
      }
    }
  }

  // Poll supervisor every few seconds
  setInterval(() => {
    supervisorTick().catch((e) => log('error', 'supervisor_error', { err: String(e) }));
  }, 4000);

  // HTTP API
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, instanceId }));

  // POST /api/send
  // Body: { threadId, to, text, accountId?, chatId?, clientMessageId }
  app.post('/api/send', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const body = req.body || {};
    const tId = (body.threadId || '').toString().trim();
    const to = (body.to || '').toString().trim();
    const text = (body.text || '').toString();
    const clientMessageId = (body.clientMessageId || '').toString().trim();

    let accountId = (body.accountId || '').toString().trim();
    let chatId = (body.chatId || '').toString().trim();

    if (!accountId || !chatId) {
      // Try to parse from threadId: `${accountId}_${chatId}`
      if (tId.includes('_')) {
        const firstUnderscore = tId.indexOf('_');
        accountId = accountId || tId.substring(0, firstUnderscore);
        chatId = chatId || tId.substring(firstUnderscore + 1);
      }
    }

    const threadId = tId || makeThreadId({ accountId, chatId: chatId || to });
    if (!threadId || !accountId) {
      return res.status(400).json({ ok: false, error: 'missing_thread_or_account' });
    }

    try {
      const { commandId } = await enqueueOutbox({
        threadId,
        accountId,
        chatId: chatId || to,
        to: to || chatId,
        text,
        media: null,
        createdByUid: decoded.uid,
        clientMessageId,
      });
      return res.json({ ok: true, commandId });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Legacy compatibility (older clients/tools)
  // POST /api/whatsapp/send-message  { to, message, accountId, threadId?, clientMessageId? }
  app.post('/api/whatsapp/send-message', async (req, res) => {
    req.body = {
      threadId: req.body?.threadId,
      to: req.body?.to,
      text: req.body?.message,
      accountId: req.body?.accountId,
      chatId: req.body?.chatId,
      clientMessageId: req.body?.clientMessageId || Date.now().toString(),
    };
    req.url = '/api/send';
    return app._router.handle(req, res, () => {});
  });

  // Admin-only: create account
  app.post('/api/accounts', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!isSuperAdminEmail(decoded.email)) return res.status(403).json({ ok: false, error: 'super_admin_only' });

    const body = req.body || {};
    const name = (body.name || '').toString().trim();
    const phone = (body.phone || '').toString().trim();
    if (!name) return res.status(400).json({ ok: false, error: 'missing_name' });

    const accountId = `wa_${crypto.randomUUID()}`;
    const db = getDb();
    const admin = getAdmin();

    await db.collection('whatsapp_accounts').doc(accountId).set(
      {
        name,
        phone: phone || '',
        status: 'disconnected',
        qrCodeDataUrl: null, // DO NOT USE (kept null for compatibility; QR is in /private/state)
        pairingCode: null, // DO NOT USE (kept null for compatibility; pairing is in /private/state)
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: null,
        disconnectReason: null,
        desiredState: 'connected',
        assignedWorkerId: null,
      },
      { merge: true },
    );

    await db
      .collection('whatsapp_accounts')
      .doc(accountId)
      .collection('private')
      .doc('state')
      .set(
        {
          qrCodeDataUrl: null,
          pairingCode: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return res.json({ ok: true, accountId });
  });

  // Legacy compatibility: POST /api/whatsapp/add-account
  app.post('/api/whatsapp/add-account', async (req, res) => {
    req.url = '/api/accounts';
    return app._router.handle(req, res, () => {});
  });

  // Admin-only: regenerate QR (best-effort on this instance)
  app.post('/api/accounts/:accountId/regenerate-qr', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!isSuperAdminEmail(decoded.email)) return res.status(403).json({ ok: false, error: 'super_admin_only' });

    const accountId = (req.params.accountId || '').toString();
    if (!accountId) return res.status(400).json({ ok: false, error: 'missing_accountId' });

    try {
      await manager.regenerateQr(accountId);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Legacy compatibility:
  // - POST /api/whatsapp/accounts/:accountId/regenerate-qr
  // - POST /api/whatsapp/regenerate-qr/:accountId
  app.post('/api/whatsapp/accounts/:accountId/regenerate-qr', async (req, res) => {
    req.url = `/api/accounts/${req.params.accountId}/regenerate-qr`;
    return app._router.handle(req, res, () => {});
  });
  app.post('/api/whatsapp/regenerate-qr/:accountId', async (req, res) => {
    req.url = `/api/accounts/${req.params.accountId}/regenerate-qr`;
    return app._router.handle(req, res, () => {});
  });

  // Admin-only: "delete" (pause) account (no history deletion)
  app.delete('/api/accounts/:accountId', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!isSuperAdminEmail(decoded.email)) return res.status(403).json({ ok: false, error: 'super_admin_only' });

    const accountId = (req.params.accountId || '').toString();
    if (!accountId) return res.status(400).json({ ok: false, error: 'missing_accountId' });

    const db = getDb();
    const admin = getAdmin();
    await db.collection('whatsapp_accounts').doc(accountId).set(
      {
        desiredState: 'paused',
        status: 'disconnected',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await stopAccountFully(accountId);
    return res.json({ ok: true });
  });

  // Legacy compatibility: DELETE /api/whatsapp/accounts/:accountId
  app.delete('/api/whatsapp/accounts/:accountId', async (req, res) => {
    req.url = `/api/accounts/${req.params.accountId}`;
    return app._router.handle(req, res, () => {});
  });

  app.listen(port, () => log('info', 'listening', { port }));

  // Shutdown handlers
  const shutdown = async () => {
    if (stopSignal.stopped) return;
    stopSignal.stopped = true;
    log('info', 'shutdown');
    for (const aId of Array.from(manager._accounts.keys())) {
      await stopAccountFully(aId);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

