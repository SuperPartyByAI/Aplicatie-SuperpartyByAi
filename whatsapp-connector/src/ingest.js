const crypto = require('crypto');
const { getDb, getAdmin } = require('./firestore');
const { uploadMediaToStorage } = require('./media');

const COL_INGEST = 'whatsapp_ingest';
const COL_THREADS = 'whatsapp_threads';
const COL_MESSAGES = 'whatsapp_messages';
const COL_ACCOUNTS = 'whatsapp_accounts';

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function extractText(msg) {
  const m = msg?.message || {};
  if (m.conversation) return String(m.conversation);
  if (m.extendedTextMessage?.text) return String(m.extendedTextMessage.text);
  if (m.imageMessage?.caption) return String(m.imageMessage.caption);
  if (m.videoMessage?.caption) return String(m.videoMessage.caption);
  return null;
}

function toTimestamp(admin, raw) {
  if (!raw) return admin.firestore.Timestamp.now();
  // baileys messageTimestamp can be Long/number/string seconds
  const n = Number(raw);
  if (Number.isFinite(n) && n > 10_000_000_000) {
    // ms
    return admin.firestore.Timestamp.fromMillis(n);
  }
  if (Number.isFinite(n) && n > 0) {
    // seconds
    return admin.firestore.Timestamp.fromMillis(n * 1000);
  }
  return admin.firestore.Timestamp.now();
}

function ingestId({ accountId, chatId, waMessageKey }) {
  return `${accountId}_${chatId}_${waMessageKey}`;
}

function threadId({ accountId, chatId }) {
  return `${accountId}_${chatId}`;
}

function messageId({ threadId, waMessageKey }) {
  return `${threadId}_${waMessageKey}`;
}

function normalizePhoneE164FromJid(jid) {
  const s = (jid || '').toString();
  const raw = s.split('@')[0] || '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('0') ? `+40${digits.substring(1)}` : digits.startsWith('40') ? `+${digits}` : `+${digits}`;
}

async function writeIngest({ accountId, msg }) {
  const db = getDb();
  const admin = getAdmin();

  const chatId = (msg?.key?.remoteJid || '').toString();
  const waMessageKey = (msg?.key?.id || '').toString();
  if (!accountId || !chatId || !waMessageKey) return { ok: false, reason: 'missing_ids' };

  const id = ingestId({ accountId, chatId, waMessageKey });
  const ref = db.collection(COL_INGEST).doc(id);

  try {
    await ref.create({
      accountId,
      chatId,
      eventType: 'message',
      waMessageKey,
      payload: msg,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: false,
      processedAt: null,
      processAttempts: 0,
      lastProcessError: null,
    });
    return { ok: true, id, created: true };
  } catch (e) {
    // Already exists -> idempotent
    return { ok: true, id, created: false };
  }
}

async function processIngestDoc(docSnap) {
  const db = getDb();
  const admin = getAdmin();
  const data = docSnap.data() || {};

  if (data.processed === true) return { ok: true, skipped: true };

  const msg = data.payload || {};
  const accountId = (data.accountId || '').toString();
  const chatId = (data.chatId || msg?.key?.remoteJid || '').toString();
  const waMessageKey = (data.waMessageKey || msg?.key?.id || '').toString();
  if (!accountId || !chatId || !waMessageKey) {
    await docSnap.ref.set(
      {
        processed: false,
        processedAt: null,
        processAttempts: (data.processAttempts || 0) + 1,
        lastProcessError: 'missing ids',
      },
      { merge: true },
    );
    return { ok: false, reason: 'missing_ids' };
  }

  const tId = threadId({ accountId, chatId });
  const mId = messageId({ threadId: tId, waMessageKey });
  const dir = msg?.key?.fromMe ? 'out' : 'in';

  const ts = toTimestamp(admin, msg?.messageTimestamp);
  const text = extractText(msg);
  const waMessageId = mId; // deterministic waMessageId

  // Best-effort media pipeline (requires Storage bucket access)
  let media = null;
  try {
    media = await uploadMediaToStorage({ threadId: tId, waMessageKey, msg });
  } catch (_) {
    media = null;
  }

  // Messages are immutable. Create if not exists.
  const msgRef = db.collection(COL_MESSAGES).doc(mId);
  try {
    await msgRef.create({
      waMessageId,
      threadId: tId,
      accountId,
      chatId,
      direction: dir,
      from: dir === 'in' ? (msg?.key?.participant || chatId || null) : null,
      to: dir === 'out' ? (chatId || null) : null,
      text: text || null,
      timestamp: ts,
      waMessageKey,
      senderUid: null,
      senderEmail: null,
      delivery: dir === 'out' ? 'sent' : null,
      error: null,
      media: media,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {
    // already exists
  }

  const threadRef = db.collection(COL_THREADS).doc(tId);
  await threadRef.set(
    {
      threadId: tId,
      accountId,
      chatId,
      clientPhoneE164: normalizePhoneE164FromJid(chatId),
      clientDisplayName: null,
      ownerUid: null,
      ownerEmail: null,
      coWriterUids: [],
      locked: false,
      lockedReason: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: ts,
      lastMessagePreview: (text || '').toString().substring(0, 200) || null,
      unreadCountGlobal: dir === 'in' ? admin.firestore.FieldValue.increment(1) : 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Update account lastEventAt + lastSynced* cursor (best-effort)
  await db.collection(COL_ACCOUNTS).doc(accountId).set(
    {
      lastEventAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSyncedAt: ts,
      lastSyncedKey: waMessageKey,
      reconnectCount: admin.firestore.FieldValue.increment(0),
    },
    { merge: true },
  );

  await docSnap.ref.set(
    {
      processed: true,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processAttempts: (data.processAttempts || 0) + 1,
      lastProcessError: null,
    },
    { merge: true },
  );

  return { ok: true };
}

async function runIngestProcessorLoop({ stopSignal, pollMs = 1500, batch = 50, log }) {
  const db = getDb();
  const admin = getAdmin();

  while (!stopSignal.stopped) {
    try {
      const snap = await db
        .collection(COL_INGEST)
        .where('processed', '==', false)
        .orderBy('receivedAt', 'asc')
        .limit(batch)
        .get();

      for (const doc of snap.docs) {
        if (stopSignal.stopped) break;
        try {
          await processIngestDoc(doc);
        } catch (e) {
          await doc.ref.set(
            {
              processed: false,
              processedAt: null,
              processAttempts: (doc.data().processAttempts || 0) + 1,
              lastProcessError: String(e?.message || e),
            },
            { merge: true },
          );
          if (log) log('warn', 'ingest_process_error', { id: doc.id, err: String(e) });
        }
      }
    } catch (e) {
      if (log) log('error', 'ingest_loop_error', { err: String(e) });
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

module.exports = {
  sha256Hex,
  ingestId,
  threadId,
  messageId,
  writeIngest,
  runIngestProcessorLoop,
};

