/**
 * Extract WhatsApp message key ID from various field formats.
 * Used for backfill/recent-sync anchor selection and migration.
 * 
 * Priority order:
 * 1. data.key?.id (most reliable)
 * 2. data.waMessageId / data.messageId / data.stanzaId
 * 3. data.message?.key?.id (nested)
 * 4. doc.id if it looks like a WA ID (hex, starts with 3EB/AC/etc, length 20-32)
 */

/**
 * Check if a string looks like a WhatsApp message ID
 * @param {string} id
 * @returns {boolean}
 */
function looksLikeWaMessageId(id) {
  if (!id || typeof id !== 'string') return false;
  // WA IDs are typically hex strings, 20-32 chars, often start with 3EB, AC, 3A, etc.
  if (id.length < 16 || id.length > 64) return false;
  // Check if it's hex-like (alphanumeric, may have some special chars but mostly hex)
  const hexPattern = /^[0-9A-Fa-f]{16,}$/;
  return hexPattern.test(id) || /^[3A][0-9A-Fa-f]{15,}$/i.test(id);
}

/**
 * Extract WhatsApp key ID from message document data
 * @param {object} docData - Firestore document data
 * @param {string} docId - Firestore document ID (fallback)
 * @returns {{ waKeyId: string | null; source: string }}
 */
function extractWaKeyId(docData, docId = null) {
  if (!docData || typeof docData !== 'object') {
    return { waKeyId: null, source: 'no_data' };
  }

  // Priority 1: data.key?.id (most reliable, from recent fixes)
  if (docData.key?.id && typeof docData.key.id === 'string' && docData.key.id.length > 0) {
    return { waKeyId: docData.key.id, source: 'key.id' };
  }

  // Priority 2: Direct fields
  const directFields = ['waMessageId', 'messageId', 'stanzaId', 'waKeyId'];
  for (const field of directFields) {
    if (docData[field] && typeof docData[field] === 'string' && docData[field].length > 0) {
      return { waKeyId: docData[field], source: field };
    }
  }

  // Priority 3: Nested message.key.id
  if (docData.message?.key?.id && typeof docData.message.key.id === 'string' && docData.message.key.id.length > 0) {
    return { waKeyId: docData.message.key.id, source: 'message.key.id' };
  }

  // Priority 4: doc.id fallback (if it looks like WA ID)
  if (docId && looksLikeWaMessageId(docId)) {
    return { waKeyId: docId, source: 'doc.id_fallback' };
  }

  return { waKeyId: null, source: 'not_found' };
}

/**
 * Extract WhatsApp metadata from message document
 * @param {object} docData - Firestore document data
 * @param {string} docId - Firestore document ID
 * @returns {{ waKeyId: string | null; waRemoteJid: string | null; waFromMe: boolean; waTimestampSec: number | null; source: string }}
 */
function extractWaMetadata(docData, docId = null) {
  const { waKeyId, source } = extractWaKeyId(docData, docId);

  // Extract remoteJid
  let waRemoteJid = docData.key?.remoteJid || docData.remoteJid || docData.clientJid || null;
  if (waRemoteJid && typeof waRemoteJid === 'string') {
    waRemoteJid = waRemoteJid.trim();
  } else {
    waRemoteJid = null;
  }

  // Extract fromMe
  const waFromMe = Boolean(docData.key?.fromMe ?? docData.fromMe ?? docData.direction === 'out');

  // Extract timestamp (convert to seconds)
  let waTimestampSec = null;
  const tsCandidates = [
    docData.key?.timestamp,
    docData.messageTimestamp,
    docData.timestamp,
    docData.tsClient,
    docData.createdAt,
  ];

  for (const ts of tsCandidates) {
    if (ts == null) continue;
    
    // Firestore Timestamp
    if (typeof ts === 'object' && typeof ts.seconds === 'number') {
      waTimestampSec = ts.seconds;
      break;
    }
    
    // Number (ms or sec)
    if (typeof ts === 'number') {
      waTimestampSec = ts > 1e12 ? Math.floor(ts / 1000) : ts;
      break;
    }
    
    // ISO string
    if (typeof ts === 'string') {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) {
        waTimestampSec = Math.floor(d.getTime() / 1000);
        break;
      }
    }
  }

  return {
    waKeyId,
    waRemoteJid,
    waFromMe,
    waTimestampSec,
    source,
  };
}

/**
 * Convert timestamp value to seconds
 * @param {any} x - Timestamp value (Firestore Timestamp, number, ISO string, etc.)
 * @returns {number | null} - Seconds since epoch, or null if invalid
 */
function toSec(x) {
  if (x == null) return null;
  // Firestore Timestamp { seconds, nanoseconds }
  if (typeof x === 'object' && typeof x.seconds === 'number') return x.seconds;
  // ISO date string
  if (typeof x === 'string') {
    const d = new Date(x);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
    const n = Number(x);
    if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n / 1000) : n;
    return null;
  }
  // number (ms or sec)
  if (typeof x === 'number') return x > 1e12 ? Math.floor(x / 1000) : x;
  return null;
}

/**
 * Pick oldest timestamp from message document (multiple candidate fields)
 * @param {object} messageDoc - Firestore message document data
 * @returns {number | null} - Seconds since epoch, or null if not found
 */
function pickOldestTimestamp(messageDoc) {
  if (!messageDoc) return null;
  // handle both "raw doc data" and nested message payloads
  const candidates = [
    messageDoc.messageTimestamp,
    messageDoc.timestamp,
    messageDoc.t,
    messageDoc.keyTimestamp,
    messageDoc.sentAt,
    messageDoc.serverTimestamp,
    messageDoc.createdAt,
    messageDoc?.message?.messageTimestamp,
    messageDoc?.message?.timestamp,
    messageDoc?.message?.t,
    messageDoc?.message?.createdAt,
  ];
  for (const c of candidates) {
    const s = toSec(c);
    if (s && Number.isFinite(s) && s > 0) return s;
  }
  return null;
}

module.exports = {
  extractWaKeyId,
  extractWaMetadata,
  looksLikeWaMessageId,
  toSec,
  pickOldestTimestamp,
};
