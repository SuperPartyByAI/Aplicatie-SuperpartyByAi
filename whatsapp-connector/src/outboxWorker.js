const crypto = require('crypto');
const { getDb, getAdmin } = require('./firestore');
const { messageId, threadId } = require('./ingest');

const COL_OUTBOX = 'whatsapp_outbox';
const COL_THREADS = 'whatsapp_threads';
const COL_MESSAGES = 'whatsapp_messages';

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function computeDedupeKey({ threadId, to, text, clientMessageId }) {
  return sha256Hex(`${threadId}|${to}|${text || ''}|${clientMessageId || ''}`);
}

function computeCommandId({ threadId, dedupeKey }) {
  return `${threadId}_${dedupeKey}`;
}

function backoffMs(attempts) {
  if (!attempts) return 0;
  return Math.min(60_000, 1000 * Math.pow(2, Math.min(6, attempts)));
}

async function enqueueOutbox({
  threadId: tId,
  accountId,
  chatId,
  to,
  text,
  media = null,
  createdByUid,
  clientMessageId,
}) {
  const db = getDb();
  const admin = getAdmin();

  const dedupeKey = computeDedupeKey({
    threadId: tId,
    to,
    text,
    clientMessageId,
  });
  const commandId = computeCommandId({ threadId: tId, dedupeKey });

  const ref = db.collection(COL_OUTBOX).doc(commandId);
  try {
    await ref.create({
      threadId: tId,
      accountId,
      chatId,
      to,
      text: text || null,
      media: media || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: createdByUid || null,
      status: 'queued',
      attempts: 0,
      lastError: null,
      dedupeKey,
      waMessageKey: null,
      lastTriedAt: null,
    });
  } catch (_) {
    // idempotent: already exists
  }

  return { commandId, dedupeKey };
}

async function claimQueuedCommand(docRef, data, instanceId) {
  const db = getDb();
  const admin = getAdmin();
  const now = admin.firestore.Timestamp.now();

  // Respect backoff for failed commands.
  const attempts = Number(data.attempts || 0);
  const lastTriedAt = data.lastTriedAt;
  if (data.status === 'failed' && lastTriedAt?.toMillis) {
    const dueAt = lastTriedAt.toMillis() + backoffMs(attempts);
    if (Date.now() < dueAt) return { ok: false, reason: 'backoff' };
  }

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return { ok: false, reason: 'missing' };
    const cur = snap.data() || {};
    if (cur.status !== 'queued' && cur.status !== 'failed') {
      return { ok: false, reason: 'not_queued' };
    }

    tx.set(
      docRef,
      {
        status: 'sending',
        attempts: Number(cur.attempts || 0) + 1,
        lastTriedAt: now,
        lastError: null,
        // NOTE: we don't add extra schema fields here.
      },
      { merge: true },
    );

    return { ok: true };
  });
}

async function markCommandFailed(docRef, err) {
  const admin = getAdmin();
  await docRef.set(
    {
      status: 'failed',
      lastError: String(err?.message || err),
      lastTriedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function markCommandSent(docRef, waMessageKey) {
  const admin = getAdmin();
  await docRef.set(
    {
      status: 'sent',
      waMessageKey: waMessageKey || null,
      lastError: null,
      lastTriedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function writeOutboundMessageAndThread({
  accountId,
  chatId,
  threadId: tId,
  waMessageKey,
  text,
  timestamp,
}) {
  const db = getDb();
  const admin = getAdmin();
  const mId = messageId({ threadId: tId, waMessageKey });

  const msgRef = db.collection(COL_MESSAGES).doc(mId);
  try {
    await msgRef.create({
      threadId: tId,
      accountId,
      chatId,
      direction: 'out',
      from: null,
      to: chatId || null,
      text: text || null,
      timestamp: timestamp || admin.firestore.Timestamp.now(),
      waMessageKey,
      media: null,
      status: 'sent',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {}

  await db.collection(COL_THREADS).doc(tId).set(
    {
      threadId: tId,
      accountId,
      chatId,
      lastMessageAt: timestamp || admin.firestore.Timestamp.now(),
      lastMessageText: text || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function runOutboxLoop({ stopSignal, pollMs = 1200, batch = 25, instanceId, sendFn, log }) {
  const db = getDb();

  while (!stopSignal.stopped) {
    try {
      // Pull both queued and failed; claim via transaction to avoid duplicates.
      const snap = await db
        .collection(COL_OUTBOX)
        .where('status', 'in', ['queued', 'failed'])
        .orderBy('createdAt', 'asc')
        .limit(batch)
        .get();

      for (const doc of snap.docs) {
        if (stopSignal.stopped) break;

        const data = doc.data() || {};
        const claim = await claimQueuedCommand(doc.ref, data, instanceId);
        if (!claim.ok) continue;

        try {
          const { accountId, chatId, to, text } = data;
          const sendRes = await sendFn({ accountId, chatId, to, text });
          const waMessageKey = (sendRes?.waMessageKey || sendRes?.keyId || '').toString();

          if (waMessageKey) {
            await writeOutboundMessageAndThread({
              accountId,
              chatId: chatId || to,
              threadId: data.threadId || threadId({ accountId, chatId: chatId || to }),
              waMessageKey,
              text,
              timestamp: sendRes?.timestamp,
            });
          }

          await markCommandSent(doc.ref, waMessageKey || null);
        } catch (e) {
          await markCommandFailed(doc.ref, e);
          if (log) log('warn', 'outbox_send_failed', { id: doc.id, err: String(e) });
        }
      }
    } catch (e) {
      if (log) log('error', 'outbox_loop_error', { err: String(e) });
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

module.exports = {
  enqueueOutbox,
  computeDedupeKey,
  computeCommandId,
  runOutboxLoop,
};

