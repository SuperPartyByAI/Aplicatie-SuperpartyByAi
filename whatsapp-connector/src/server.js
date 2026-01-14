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
const { emitAlert } = require('./alerts');
const { failFastConfig } = require('./env');
const pino = require('pino');
const { writeAudit } = require('./audit');
const {
  SendRequestSchema,
  AccountsCreateSchema,
  RegenerateQrParamsSchema,
  HealthResponseSchema,
  parseOr400,
} = require('./schemas');

const SUPER_ADMIN_EMAIL = 'ursache.andrei1995@gmail.com';
const CONNECTOR_VERSION = (() => {
  try {
    // eslint-disable-next-line global-require
    return require('../package.json')?.version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
})();

function gitSha() {
  return (
    (process.env.GIT_SHA || '').toString().trim() ||
    (process.env.RAILWAY_GIT_COMMIT_SHA || '').toString().trim() ||
    (process.env.RAILWAY_GIT_COMMIT || '').toString().trim() ||
    null
  );
}

function isSuperAdminEmail(email) {
  return (email || '').toString().trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

async function isEmployee(decoded) {
  if (!decoded?.uid) return false;
  if (isSuperAdminEmail(decoded.email)) return true;
  try {
    const db = getDb();
    const doc = await db.collection('staffProfiles').doc(decoded.uid).get();
    return doc.exists;
  } catch (_) {
    return false;
  }
}

const logger = pino({
  level: (process.env.LOG_LEVEL || 'info').toString(),
});

function log(level, msg, meta) {
  logger[level] ? logger[level]({ ...(meta || {}) }, msg) : logger.info({ ...(meta || {}) }, msg);
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
  const cfg = failFastConfig();
  initFirebase();

  const instanceId = getInstanceId();
  const port = envInt('PORT', 8080);
  const maxAccounts = envInt('MAX_ACCOUNTS', 30);
  const leaseMs = envInt('LEASE_MS', 25_000);
  const renewEveryMs = envInt('LEASE_RENEW_EVERY_MS', 15_000);
  const shardCount = envInt('SHARD_COUNT', 1);
  const shardIndex = envInt('SHARD_INDEX', 0);
  const maxMsgsPerMinPerUser = envInt('RATE_LIMIT_USER_PER_MIN', 20);
  const maxMsgsPerMinPerAccount = envInt('RATE_LIMIT_ACCOUNT_PER_MIN', 60);

  // SESSIONS_PATH must be provided in prod; dev can fallback.
  const sessionsPath = (cfg.sessionsPath || '').trim() || path.join(__dirname, '..', '.sessions');
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
  const rateStateByUid = new Map(); // uid -> { windowStartMs, count }
  const rateStateByAccount = new Map(); // accountId -> { windowStartMs, count }

  function _rateCheck(map, key, limit) {
    const now = Date.now();
    const cur = map.get(key);
    if (!cur || now - cur.windowStartMs >= 60_000) {
      map.set(key, { windowStartMs: now, count: 1 });
      return { ok: true };
    }
    cur.count += 1;
    if (cur.count > limit) return { ok: false, retryAfterSec: Math.ceil((60_000 - (now - cur.windowStartMs)) / 1000) };
    return { ok: true };
  }

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
    const mirrorBehindSec = envInt('MIRROR_BEHIND_SEC', 600);

    for (const doc of snap.docs) {
      const aId = doc.id;
      const data = doc.data() || {};
      const desiredState = (data.desiredState || 'connected').toString();
      if (desiredState === 'paused') {
        continue;
      }
      desired.add(aId);
      await ensureLeaseAndRun(aId);

      // Degraded detector: connected but stale heartbeat (>60s)
      try {
        const status = (data.status || '').toString();
        const lastSeenAt = data.lastSeenAt?.toMillis ? data.lastSeenAt.toMillis() : 0;
        const stale = status === 'connected' && lastSeenAt > 0 && Date.now() - lastSeenAt > 60_000;
        if (stale && data.degraded !== true) {
          await db.collection('whatsapp_accounts').doc(aId).set(
            {
              degraded: true,
              degradedReason: 'heartbeat_stale',
              updatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          await emitAlert({
            type: 'degraded',
            severity: 'error',
            accountId: aId,
            message: 'Connected but heartbeat stale >60s',
          });
        }

        // Backfill verifier: if we have a sync gap open for too long, alert "mirror behind"
        const gapStartMs = data.syncGapStartAt?.toMillis ? data.syncGapStartAt.toMillis() : 0;
        const alertedMs = data.mirrorBehindAlertedAt?.toMillis ? data.mirrorBehindAlertedAt.toMillis() : 0;
        const isMirrorBehind = gapStartMs > 0 && Date.now() - gapStartMs > mirrorBehindSec * 1000;
        const shouldAlert = isMirrorBehind && (!alertedMs || Date.now() - alertedMs > mirrorBehindSec * 1000);
        if (shouldAlert) {
          await db.collection('whatsapp_accounts').doc(aId).set(
            {
              degraded: true,
              degradedReason: 'mirror_behind',
              mirrorBehindAlertedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
              updatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          await emitAlert({
            type: 'mirror_behind',
            severity: 'warn',
            accountId: aId,
            message: `Sync gap open >${mirrorBehindSec}s (catch-up pending)`,
            meta: { syncGapStartAt: data.syncGapStartAt || null },
          });
        }
      } catch (_) {}
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
  app.use((req, res, next) => {
    const requestId = (req.headers['x-request-id'] || '').toString().trim() || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.get('/health', async (_req, res) => {
    try {
      const db = getDb();
      const snap = await db.collection('whatsapp_accounts').limit(200).get();
      const accounts = snap.docs.map((d) => {
        const a = d.data() || {};
        const lastSeenMs = a.lastSeenAt?.toMillis ? a.lastSeenAt.toMillis() : 0;
        const heartbeatAgeSec = lastSeenMs ? Math.floor((Date.now() - lastSeenMs) / 1000) : null;
        return {
          accountId: d.id,
          status: a.status || null,
          lastSeenAt: a.lastSeenAt || null,
          heartbeatAgeSec,
          degraded: a.degraded === true,
          assignedWorkerId: a.assignedWorkerId || null,
          reconnectCount: Number(a.reconnectCount || 0) || 0,
        };
      });

      // Best-effort backlog metrics (avoid heavy scans)
      const outboxSnap = await db
        .collection('whatsapp_outbox')
        .where('status', 'in', ['queued', 'failed'])
        .orderBy('createdAt', 'asc')
        .limit(50)
        .get();
      const outboxBacklog = outboxSnap.size;

      const oldestIngestSnap = await db
        .collection('whatsapp_ingest')
        .where('processed', '==', false)
        .orderBy('receivedAt', 'asc')
        .limit(1)
        .get();
      const oldestIngest = oldestIngestSnap.docs[0]?.data()?.receivedAt || null;
      const ingestLagSec =
        oldestIngest?.toMillis && oldestIngest.toMillis()
          ? Math.max(0, Math.floor((Date.now() - oldestIngest.toMillis()) / 1000))
          : 0;

      // Leases (bounded)
      const leaseSnap = await db.collection('whatsapp_account_leases').limit(200).get();
      const leases = leaseSnap.docs.map((d) => {
        const l = d.data() || {};
        return {
          accountId: d.id,
          ownerInstanceId: (l.ownerInstanceId || '').toString() || null,
          leaseUntil: l.leaseUntil || null,
        };
      });

      const statusCounts = accounts.reduce(
        (acc, a) => {
          const s = (a.status || 'unknown').toString();
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        },
        { total: accounts.length },
      );

      // SLO/SLI thresholds (documented in docs/WHATSAPP_SLO.md)
      const thresholds = {
        heartbeatStaleSec: 60,
        ingestLagWarnSec: 120,
        outboxBacklogWarn: 100,
      };

      const anyHeartbeatBad = accounts.some(
        (a) => a.status === 'connected' && a.heartbeatAgeSec != null && a.heartbeatAgeSec > thresholds.heartbeatStaleSec,
      );
      const healthy =
        !anyHeartbeatBad && ingestLagSec <= thresholds.ingestLagWarnSec && outboxBacklog <= thresholds.outboxBacklogWarn;

      return res.json({
        ok: true,
        version: CONNECTOR_VERSION,
        gitSha: gitSha(),
        instanceId,
        uptimeSec: Math.floor(process.uptime()),
        runningAccounts: Array.from(manager._accounts.keys()),
        statusCounts,
        accounts,
        leases,
        outboxBacklog,
        oldestUnprocessedIngestAt: oldestIngest,
        ingestLagSec,
        healthy,
        thresholds,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e), instanceId });
    }
  });

  // POST /api/send
  // Body: { threadId, to, text, accountId?, chatId?, clientMessageId }
  app.post('/api/send', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!(await isEmployee(decoded))) return res.status(403).json({ ok: false, error: 'employee_only' });

    const bodyRaw = req.body || {};
    const parsed = parseOr400(SendRequestSchema, bodyRaw);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    const body = parsed.data;
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
      // Rate limiting (in-memory best-effort)
      const rUser = _rateCheck(rateStateByUid, decoded.uid, maxMsgsPerMinPerUser);
      if (!rUser.ok) return res.status(429).json({ ok: false, error: 'rate_limited_user', retryAfterSec: rUser.retryAfterSec });
      const rAcc = _rateCheck(rateStateByAccount, accountId, maxMsgsPerMinPerAccount);
      if (!rAcc.ok) return res.status(429).json({ ok: false, error: 'rate_limited_account', retryAfterSec: rAcc.retryAfterSec });

      // Cooldown mode (persisted)
      // - First outbound message sets ownerUid/ownerEmail.
      // - Subsequent sends allowed only for owner/co-writer/super-admin, and if not locked.
      const db = getDb();
      const admin = getAdmin();
      const accSnap = await db.collection('whatsapp_accounts').doc(accountId).get();
      const acc = accSnap.data() || {};
      const cooldownUntil = acc.cooldownUntil;
      if (cooldownUntil?.toMillis && Date.now() < cooldownUntil.toMillis() && !isSuperAdminEmail(decoded.email)) {
        const retryAfterSec = Math.ceil((cooldownUntil.toMillis() - Date.now()) / 1000);
        return res.status(429).json({ ok: false, error: 'cooldown', retryAfterSec });
      }

      const threadRef = db.collection('whatsapp_threads').doc(threadId);

      // Transactional owner-claim (prevents race on first outbound send)
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(threadRef);
        if (!snap.exists) {
          tx.set(
            threadRef,
            {
              threadId,
              accountId,
              chatId: chatId || to,
              clientPhoneE164: null,
              clientDisplayName: null,
              ownerUid: decoded.uid,
              ownerEmail: decoded.email || null,
              coWriterUids: [],
              locked: false,
              lockedReason: null,
              lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
              lastMessagePreview: (text || '').toString().substring(0, 200) || null,
              unreadCountGlobal: 0,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          return;
        }

        const t = snap.data() || {};
        const locked = Boolean(t.locked);
        if (locked && !isSuperAdminEmail(decoded.email)) throw new Error('thread_locked');

        const existingOwnerUid = (t.ownerUid || '').toString();
        const co = Array.isArray(t.coWriterUids) ? t.coWriterUids.map(String) : [];

        if (!existingOwnerUid) {
          // First outbound claims owner on an inbound-created thread.
          tx.set(
            threadRef,
            { ownerUid: decoded.uid, ownerEmail: decoded.email || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true },
          );
          return;
        }

        const allowed = isSuperAdminEmail(decoded.email) || existingOwnerUid === decoded.uid || co.includes(decoded.uid);
        if (!allowed) throw new Error('not_thread_writer');
      });

      const { commandId } = await enqueueOutbox({
        threadId,
        accountId,
        chatId: chatId || to,
        to: to || chatId,
        text,
        media: null,
        createdByUid: decoded.uid,
        createdByEmail: decoded.email || null,
        clientMessageId,
      });
      await writeAudit({
        actorUid: decoded.uid,
        actorEmail: decoded.email || null,
        action: 'send_enqueued',
        accountId,
        threadId,
        requestId: req.requestId,
        target: { to: to || chatId, clientMessageId, commandId },
      });
      return res.json({ ok: true, commandId });
    } catch (e) {
      const code = String(e?.message || e);
      if (code === 'thread_locked' || code === 'not_thread_writer') {
        await writeAudit({
          actorUid: decoded.uid,
          actorEmail: decoded.email || null,
          action: 'send_denied',
          accountId,
          threadId,
          requestId: req.requestId,
          target: { reason: code, to: to || chatId, clientMessageId },
        }).catch(() => {});
        return res.status(403).json({ ok: false, error: code });
      }
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

    const parsed = parseOr400(AccountsCreateSchema, req.body || {});
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    const name = parsed.data.name.toString().trim();
    const phone = parsed.data.phone.toString().trim();

    const accountId = `wa_${crypto.randomUUID()}`;
    const db = getDb();
    const admin = getAdmin();

    await db.collection('whatsapp_accounts').doc(accountId).set(
      {
        name,
        status: 'disconnected',
        phoneE164: phone || '',
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

    await writeAudit({
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      action: 'account_create',
      accountId,
      requestId: req.requestId,
      target: { name, phoneE164: phone || '' },
    });

    return res.json({ ok: true, accountId });
  });

  // Handover workflows (owner or super-admin)
  app.post('/api/threads/:threadId/cowriters/add', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!(await isEmployee(decoded))) return res.status(403).json({ ok: false, error: 'employee_only' });

    const threadId = (req.params.threadId || '').toString();
    const uid = (req.body?.uid || '').toString().trim();
    if (!threadId || !uid) return res.status(400).json({ ok: false, error: 'missing_params' });

    const db = getDb();
    const admin = getAdmin();
    await db.runTransaction(async (tx) => {
      const ref = db.collection('whatsapp_threads').doc(threadId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('thread_not_found');
      const t = snap.data() || {};
      const ownerUid = (t.ownerUid || '').toString();
      const allowed = isSuperAdminEmail(decoded.email) || (ownerUid && ownerUid === decoded.uid);
      if (!allowed) throw new Error('not_owner');
      tx.set(
        ref,
        { coWriterUids: admin.firestore.FieldValue.arrayUnion(uid), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
    await writeAudit({
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      action: 'cowriter_add',
      threadId,
      requestId: req.requestId,
      target: { uid },
    }).catch(() => {});
    return res.json({ ok: true });
  });

  app.post('/api/threads/:threadId/cowriters/remove', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!(await isEmployee(decoded))) return res.status(403).json({ ok: false, error: 'employee_only' });

    const threadId = (req.params.threadId || '').toString();
    const uid = (req.body?.uid || '').toString().trim();
    if (!threadId || !uid) return res.status(400).json({ ok: false, error: 'missing_params' });

    const db = getDb();
    const admin = getAdmin();
    await db.runTransaction(async (tx) => {
      const ref = db.collection('whatsapp_threads').doc(threadId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('thread_not_found');
      const t = snap.data() || {};
      const ownerUid = (t.ownerUid || '').toString();
      const allowed = isSuperAdminEmail(decoded.email) || (ownerUid && ownerUid === decoded.uid);
      if (!allowed) throw new Error('not_owner');
      tx.set(
        ref,
        { coWriterUids: admin.firestore.FieldValue.arrayRemove(uid), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
    await writeAudit({
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      action: 'cowriter_remove',
      threadId,
      requestId: req.requestId,
      target: { uid },
    }).catch(() => {});
    return res.json({ ok: true });
  });

  app.post('/api/threads/:threadId/lock', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!(await isEmployee(decoded))) return res.status(403).json({ ok: false, error: 'employee_only' });

    const threadId = (req.params.threadId || '').toString();
    const locked = Boolean(req.body?.locked);
    const reason = (req.body?.reason || '').toString();

    const db = getDb();
    const admin = getAdmin();
    await db.runTransaction(async (tx) => {
      const ref = db.collection('whatsapp_threads').doc(threadId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('thread_not_found');
      const t = snap.data() || {};
      const ownerUid = (t.ownerUid || '').toString();
      const allowed = isSuperAdminEmail(decoded.email) || (ownerUid && ownerUid === decoded.uid);
      if (!allowed) throw new Error('not_owner');
      tx.set(
        ref,
        { locked, lockedReason: reason || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
    await writeAudit({
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      action: locked ? 'thread_lock' : 'thread_unlock',
      threadId,
      requestId: req.requestId,
      target: { locked, reason: reason || null },
    }).catch(() => {});
    return res.json({ ok: true });
  });

  // Transfer owner (super-admin only)
  app.post('/api/threads/:threadId/transfer-owner', async (req, res) => {
    const decoded = await verifyIdToken(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!isSuperAdminEmail(decoded.email)) return res.status(403).json({ ok: false, error: 'super_admin_only' });

    const threadId = (req.params.threadId || '').toString();
    const newOwnerUid = (req.body?.newOwnerUid || '').toString().trim();
    const newOwnerEmail = (req.body?.newOwnerEmail || '').toString().trim();
    if (!threadId || !newOwnerUid) return res.status(400).json({ ok: false, error: 'missing_params' });

    const db = getDb();
    const admin = getAdmin();
    await db.collection('whatsapp_threads').doc(threadId).set(
      {
        ownerUid: newOwnerUid,
        ownerEmail: newOwnerEmail || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await writeAudit({
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      action: 'transfer_owner',
      threadId,
      requestId: req.requestId,
      target: { newOwnerUid, newOwnerEmail: newOwnerEmail || null },
    }).catch(() => {});
    return res.json({ ok: true });
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

    const params = parseOr400(RegenerateQrParamsSchema, req.params || {});
    if (!params.ok) return res.status(400).json({ ok: false, error: params.error });
    const accountId = params.data.accountId;

    try {
      await manager.regenerateQr(accountId);
      await writeAudit({
        actorUid: decoded.uid,
        actorEmail: decoded.email || null,
        action: 'account_regenerate_qr',
        accountId,
        requestId: req.requestId,
      });
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
    await writeAudit({
      actorUid: decoded.uid,
      actorEmail: decoded.email || null,
      action: 'account_pause',
      accountId,
      requestId: req.requestId,
    });
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

