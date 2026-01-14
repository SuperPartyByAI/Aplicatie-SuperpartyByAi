const crypto = require('crypto');
const { getDb, getAdmin } = require('./firestore');
const { messageId, threadId } = require('./ingest');
const { emitAlert } = require('./alerts');

const COL_OUTBOX = 'whatsapp_outbox';
const COL_THREADS = 'whatsapp_threads';
const COL_MESSAGES = 'whatsapp_messages';
const COL_ACCOUNTS = 'whatsapp_accounts';

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

function shouldUpdateLastMessage(existingMillis, nextMillis) {
  if (!existingMillis) return true;
  if (!nextMillis) return false;
  return Number(nextMillis) >= Number(existingMillis);
}

async function enqueueOutbox({
  threadId: tId,
  accountId,
  chatId,
  to,
  text,
  media = null,
  createdByUid,
  createdByEmail,
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
      createdByEmail: createdByEmail || null,
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

  // Create a queued placeholder message (employee-visible) so UI can show "queued".
  // It will later be linked to the real WA message id once waMessageKey is known.
  const placeholderRef = db.collection(COL_MESSAGES).doc(commandId);
  try {
    await placeholderRef.create({
      waMessageId: commandId,
      threadId: tId,
      accountId,
      chatId,
      direction: 'out',
      from: null,
      to: chatId || to || null,
      text: text || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      waMessageKey: null,
      senderUid: createdByUid || null,
      senderEmail: createdByEmail || null,
      delivery: 'queued',
      error: null,
      media: media || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      replacedBy: null,
    });
  } catch (_) {}

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

  // Propagate to the employee-visible placeholder message.
  // UI expects `delivery: failed` for outbound failures.
  try {
    const db = getDb();
    await db.collection(COL_MESSAGES).doc(docRef.id).set(
      {
        delivery: 'failed',
        error: String(err?.message || err),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (_) {}
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
  senderUid,
  senderEmail,
  placeholderId,
}) {
  const db = getDb();
  const admin = getAdmin();
  const mId = messageId({ threadId: tId, waMessageKey });

  const msgRef = db.collection(COL_MESSAGES).doc(mId);
  try {
    await msgRef.create({
      waMessageId: mId,
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
      senderUid: senderUid || null,
      senderEmail: senderEmail || null,
      delivery: 'sent',
      error: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {}

  await db.collection(COL_THREADS).doc(tId).set(
    { updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );

  // Monotonic lastMessageAt update
  const threadRef = db.collection(COL_THREADS).doc(tId);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(threadRef);
    const curData = cur.exists ? cur.data() || {} : {};
    const curLast = curData.lastMessageAt?.toMillis ? curData.lastMessageAt.toMillis() : 0;
    const nextTs = timestamp && timestamp.toMillis ? timestamp : admin.firestore.Timestamp.now();
    const nextLast = nextTs.toMillis ? nextTs.toMillis() : 0;

    const update = {
      threadId: tId,
      accountId,
      chatId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      unreadCountGlobal: 0, // staff replied -> clear global unread backlog
    };
    if (shouldUpdateLastMessage(curLast, nextLast)) {
      update.lastMessageAt = nextTs;
      update.lastMessagePreview = (text || '').toString().substring(0, 200) || null;
    }
    tx.set(threadRef, update, { merge: true });
  });

  // Update placeholder if we created one
  if (placeholderId) {
    await db.collection(COL_MESSAGES).doc(placeholderId).set(
      {
        delivery: 'sent',
        replacedBy: mId,
        waMessageKey: waMessageKey || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

async function runOutboxLoop({ stopSignal, pollMs = 1200, batch = 25, instanceId, sendFn, log }) {
  const db = getDb();
  const admin = getAdmin();
  const cooldownFailures = Number(process.env.COOLDOWN_FAIL_THRESHOLD || 5);
  const cooldownMinutes = Number(process.env.COOLDOWN_MINUTES || 5);

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
          const { accountId, chatId, to, text, createdByUid, createdByEmail } = data;
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
              senderUid: createdByUid,
              senderEmail: createdByEmail,
              placeholderId: doc.id,
            });
          }

          await markCommandSent(doc.ref, waMessageKey || null);

          // Reset failure/cooldown
          await db.collection(COL_ACCOUNTS).doc(accountId).set(
            {
              rateLimitState: { consecutiveFailures: 0 },
              cooldownUntil: null,
              lastEventAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        } catch (e) {
          await markCommandFailed(doc.ref, e);
          if (log) log('warn', 'outbox_send_failed', { id: doc.id, err: String(e) });

          // Failure tracking + cooldown
          try {
            const accountId = (data.accountId || '').toString();
            if (accountId) {
              const accRef = db.collection(COL_ACCOUNTS).doc(accountId);
              const r = await db.runTransaction(async (tx) => {
                const snap = await tx.get(accRef);
                const cur = snap.exists ? snap.data() || {} : {};
                const curFailures = Number(cur.rateLimitState?.consecutiveFailures || 0);
                const nextFailures = curFailures + 1;
                const patch = {
                  rateLimitState: { ...(cur.rateLimitState || {}), consecutiveFailures: nextFailures },
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                const cooldownTriggered = nextFailures >= cooldownFailures;
                if (nextFailures >= cooldownFailures) {
                  patch.cooldownUntil = admin.firestore.Timestamp.fromMillis(Date.now() + cooldownMinutes * 60_000);
                }
                tx.set(accRef, patch, { merge: true });
                return { cooldownTriggered, nextFailures };
              });

              if (r?.cooldownTriggered) {
                await emitAlert({
                  type: 'cooldown',
                  severity: 'error',
                  accountId,
                  message: `Cooldown triggered after ${cooldownFailures} consecutive outbox failures`,
                  meta: { cooldownMinutes, commandId: doc.id, consecutiveFailures: r.nextFailures },
                }).catch(() => {});
              }
            }
          } catch (_) {}
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

