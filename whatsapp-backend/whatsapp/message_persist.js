/**
 * Message persistence: idempotent write to threads/{threadId} and threads/{threadId}/messages/{messageId}.
 * Used by realtime messages.upsert, history sync, outbox send.
 */

const crypto = require('crypto');
const {
  normalizeMessageText,
  getMessageType,
  getStableKey,
  getStrongFingerprint,
  chooseDocId,
} = require('../lib/wa-message-identity');
const { canonicalizeJid, computeTsClient } = require('../lib/wa-canonical');

let admin = null;
try {
  admin = require('firebase-admin');
} catch (_) {
  admin = null;
}

function extractBodyAndType(msg) {
  const body = normalizeMessageText(msg);
  const type = getMessageType(msg);
  return { body, type };
}

/**
 * Normalize message timestamp to milliseconds (Baileys often uses seconds).
 * @param {number|string|{ toNumber: () => number }|{ low?: number; high?: number }} value
 * @returns {number|null}
 */
function extractTimestampMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
    const p = Date.parse(value);
    return Number.isNaN(p) ? null : p;
  }
  if (value && typeof value.toNumber === 'function') {
    const n = value.toNumber();
    return n < 1e12 ? n * 1000 : n;
  }
  if (value && typeof value === 'object' && ('low' in value || 'high' in value)) {
    try {
      const n = Number(value);
      return n < 1e12 ? n * 1000 : n;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * @param {object} msg - Baileys message
 * @returns {{ stableCandidates: string[] }}
 */
function computeStableIds(msg) {
  const ids = [];
  const waId = msg?.key?.id;
  if (waId && typeof waId === 'string') ids.push(waId);
  const rawJid = msg?.key?.remoteJid;
  const { canonicalJid } = canonicalizeJid(rawJid || '');
  const accountId = ''; // Callers use threadId; we derive candidates from msg only
  const sk = getStableKey({ accountId: 'x', canonicalJid: canonicalJid || rawJid, msg });
  if (sk) ids.push(chooseDocId({ stableKey: sk, strongFingerprint: null }));
  const tsMs = extractTimestampMs(msg?.messageTimestamp);
  const fp = getStrongFingerprint({
    accountId: 'x',
    canonicalJid: canonicalJid || rawJid,
    msg,
    tsClientMs: tsMs,
  });
  if (fp) ids.push(chooseDocId({ stableKey: null, strongFingerprint: fp }));
  return { stableCandidates: ids.filter(Boolean) };
}

/**
 * Resolve message document ID. Prefer stableId if provided; otherwise fallback.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} accountId
 * @param {string} stableId
 * @param {string} fallbackId
 * @returns {Promise<string>}
 */
async function resolveMessageDocId(db, accountId, stableId, fallbackId) {
  if (stableId && typeof stableId === 'string') return stableId;
  return fallbackId || `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

const PREVIEW_MAX = 100;

/**
 * Idempotent write: update thread + set message. Merges threadOverrides and extraFields.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ accountId: string; clientJid: string; threadId: string; direction: 'inbound'|'outbound' }} opts
 * @param {object} msg - Baileys message
 * @param {{ extraFields?: object; threadOverrides?: object; messageIdOverride?: string }} options
 * @returns {Promise<{ messageId: string; threadId: string; messageBody?: string } | null>}
 */
async function writeMessageIdempotent(db, opts, msg, options = {}) {
  if (!db || !opts?.accountId || !opts.threadId || !msg?.key) return null;

  const { accountId, clientJid, threadId, direction } = opts;
  const { extraFields = {}, threadOverrides = {}, messageIdOverride } = options;
  const { body } = extractBodyAndType(msg);
  const ts = computeTsClient({ messageTimestamp: msg?.messageTimestamp });
  // CRITICAL: Use message timestamp (not serverTimestamp) for lastMessageAt to preserve correct ordering
  // Only fallback to current time if messageTimestamp is completely missing (should be rare)
  const tsClientAt = ts?.tsClientAt || null; // Don't use Timestamp.now() - prefer null if timestamp missing
  const tsClientMs = ts?.tsClientMs ?? null; // Don't use Date.now() - prefer null if timestamp missing

  const stable = computeStableIds(msg);
  // CRITICAL: Prefer msg.key.id as doc.id for stability and backfill compatibility
  // This ensures fetchMessageHistory can use doc.id directly as oldestMsgKey.id
  const waKeyId = msg?.key?.id;
  const fallbackId =
    waKeyId ||
    crypto.createHash('sha256').update(`${accountId}|${threadId}|${Date.now()}`).digest('hex').slice(0, 24);
  // Prefer waKeyId over stable candidates for doc.id (ensures compatibility with fetchMessageHistory)
  const messageId = messageIdOverride || waKeyId || (await resolveMessageDocId(db, accountId, stable.stableCandidates[0], fallbackId));

  const preview =
    typeof body === 'string' && body.length > 0
      ? body.slice(0, PREVIEW_MAX).replace(/\s+/g, ' ')
      : null;

  // FIX: Allowlist for real content - only update thread if message has actual content
  // Protocol messages (historySyncNotification) should not pollute thread metadata
  const hasText = !!preview && preview.trim().length > 0;
  const hasConversation = !!msg?.message?.conversation;
  const hasExtendedText = !!msg?.message?.extendedTextMessage?.text;
  const hasMedia = !!(msg?.message?.imageMessage || msg?.message?.videoMessage || msg?.message?.audioMessage || msg?.message?.documentMessage || msg?.message?.stickerMessage);
  const hasProtocolMessage = !!msg?.message?.protocolMessage;
  
  // Only update thread if message has real content (text or media), not protocol-only
  const hasRealContent = hasText || hasMedia || hasConversation || hasExtendedText;
  const isProtocolOnly = hasProtocolMessage && !hasRealContent;
  const shouldUpdateThread = hasRealContent && !isProtocolOnly;

  const threadRef = db.collection('threads').doc(threadId);
  
  // CRITICAL FIX: Extract clientJid from threadId if not provided (threadId format: accountId__clientJid)
  // This ensures Flutter Inbox always has clientJid to display name/phone instead of "?"
  // EDGE CASE: Only fill missing, never overwrite existing clientJid
  let resolvedClientJid = clientJid;
  if (!resolvedClientJid || typeof resolvedClientJid !== 'string' || resolvedClientJid.trim() === '') {
    // Extract from threadId: accountId__clientJid
    // Only parse if threadId has separator '__' and right part looks like JID
    if (threadId && typeof threadId === 'string' && threadId.includes('__')) {
      const parts = threadId.split('__');
      if (parts.length >= 2) {
        const candidateJid = parts.slice(1).join('__'); // Join in case clientJid contains '__'
        // Validate: candidateJid should look like a JID (ends with @s.whatsapp.net, @g.us, @lid, etc.)
        if (candidateJid && typeof candidateJid === 'string' && 
            (candidateJid.endsWith('@s.whatsapp.net') || 
             candidateJid.endsWith('@g.us') || 
             candidateJid.endsWith('@lid') ||
             candidateJid.endsWith('@c.us') ||
             candidateJid.endsWith('@broadcast'))) {
          resolvedClientJid = candidateJid;
        }
      }
    }
  }
  
  const isLid = resolvedClientJid && typeof resolvedClientJid === 'string' && resolvedClientJid.endsWith('@lid');
  
  // Extract phoneE164 from clientJid if it's a phone number (for 1:1 chats only, not groups)
  // EDGE CASE: Only for @s.whatsapp.net or @c.us, normalize phone digits consistently
  let phoneE164 = null;
  if (resolvedClientJid && typeof resolvedClientJid === 'string') {
    const isPhoneJid = resolvedClientJid.endsWith('@s.whatsapp.net') || resolvedClientJid.endsWith('@c.us');
    if (isPhoneJid) {
      const phoneDigits = resolvedClientJid.split('@')[0]?.replace(/\D/g, '') || '';
      // Validate: phone digits should be 6-15 digits (international format)
      if (phoneDigits.length >= 6 && phoneDigits.length <= 15) {
        // Normalize: always add + prefix for E164 format
        phoneE164 = `+${phoneDigits}`;
      }
    }
  }
  
  // Only update thread if it's not a protocol-only message
  // CRITICAL FIX: Only update lastMessageText and lastMessageAt for INBOUND messages
  // This ensures inbox always shows the last RECEIVED message, not the last SENT message
  const isInbound = direction === 'inbound';
  if (shouldUpdateThread) {
    const threadUpdate = {
      accountId,
      // Only set clientJid if it's not already in threadOverrides (preserve existing)
      clientJid: threadOverrides.clientJid || resolvedClientJid || null,
      isLid: isLid || false, // Indexable field for filtering @lid threads in queries
      // CRITICAL FIX: Only update lastMessageText and lastMessageAt for INBOUND messages
      // For outbound messages, preserve the existing lastMessageText/lastMessageAt (last received message)
      ...(isInbound && tsClientAt ? { lastMessageAt: tsClientAt } : {}),
      ...(isInbound ? { lastMessagePreview: preview } : {}), // Keep for backward compatibility
      ...(isInbound ? { lastMessageText: preview } : {}), // New field name (preferred by frontend)
      // Always update updatedAt to track thread activity
      updatedAt: admin?.firestore?.FieldValue?.serverTimestamp?.() ?? null,
      // Set phoneE164 if available and not already set in threadOverrides (only for 1:1, not groups)
      ...(phoneE164 && !threadOverrides.phoneE164 && !threadOverrides.phone ? { phoneE164, phone: phoneE164, phoneNumber: phoneE164 } : {}),
      ...threadOverrides,
    };
    if (threadUpdate.updatedAt === null) delete threadUpdate.updatedAt;
    await threadRef.set(threadUpdate, { merge: true });
    
    // Log thread update for debugging (always log, even if preview is empty, to confirm thread update)
    const accountIdShort = accountId ? accountId.substring(0, 8) : 'unknown';
    const threadIdShort = threadId ? threadId.substring(0, 8) : 'unknown';
    if (isInbound) {
      if (preview && preview.length > 0) {
        console.log(`📥 [${accountIdShort}] Updated thread ${threadIdShort} (INBOUND): lastMessageAt=${tsClientAt ? 'Timestamp' : 'null'}, lastMessageText="${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}"`);
      } else {
        console.log(`📥 [${accountIdShort}] Updated thread ${threadIdShort} (INBOUND): lastMessageAt=${tsClientAt ? 'Timestamp' : 'null'}, lastMessageText=null (no preview)`);
      }
    } else {
      console.log(`📤 [${accountIdShort}] Thread ${threadIdShort} (OUTBOUND): lastMessageText/lastMessageAt NOT updated (preserving last received message)`);
    }
  } else {
    // No real content or protocol-only message - skip thread update but still log for debugging
    const accountIdShort = accountId ? accountId.substring(0, 8) : 'unknown';
    const threadIdShort = threadId ? threadId.substring(0, 8) : 'unknown';
    const msgKeys = Object.keys(msg?.message || {});
    const protocolType = msg?.message?.protocolMessage?.type;
    if (hasProtocolMessage) {
      console.log(`⏭️  [${accountIdShort}] Skipped thread update: noMessageContent keys=[${msgKeys.join(',')}] protocolType=${protocolType || 'unknown'} thread=${threadIdShort}`);
    } else {
      console.log(`⏭️  [${accountIdShort}] Skipped thread update: noMessageContent keys=[${msgKeys.join(',')}] thread=${threadIdShort}`);
    }
  }

  const messageRef = threadRef.collection('messages').doc(messageId);
  const isGroup = clientJid && typeof clientJid === 'string' && clientJid.endsWith('@g.us');
  const senderJid = isGroup ? (msg?.key?.participant || msg?.participant || null) : null;
  
  const messageData = {
    accountId,
    clientJid: clientJid || null,
    threadId,
    direction,
    body: body || null,
    tsClient: tsClientAt,
    createdAt: admin?.firestore?.FieldValue?.serverTimestamp?.() ?? null,
    updatedAt: admin?.firestore?.FieldValue?.serverTimestamp?.() ?? null,
    ...(senderJid ? { senderId: senderJid, senderJid: senderJid } : {}), // Add senderId for group messages
    ...extraFields,
  };
  // Preserve original WhatsApp message key for fetchMessageHistory
  if (msg && msg.key) {
    messageData.key = {
      id: msg.key.id || null,
      remoteJid: msg.key.remoteJid || null,
      fromMe: msg.key.fromMe || false,
      timestamp: msg.key.timestamp || null,
      ...(msg.key.participant ? { participant: msg.key.participant } : {}), // Preserve participant for group messages
    };
  }
  if (messageData.createdAt === null) delete messageData.createdAt;
  if (messageData.updatedAt === null) delete messageData.updatedAt;
  await messageRef.set(messageData, { merge: true });

  return {
    messageId,
    threadId,
    messageBody: body || undefined,
  };
}

module.exports = {
  extractBodyAndType,
  extractTimestampMs,
  computeStableIds,
  resolveMessageDocId,
  writeMessageIdempotent,
};
