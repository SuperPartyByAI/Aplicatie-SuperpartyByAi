const crypto = require('crypto');
let admin = null;

try {
  // firebase-admin is optional here; only used for Timestamp creation
  admin = require('firebase-admin');
} catch (_error) {
  admin = null;
}

const safeHash = (value) =>
  crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 8);

const normalizeNumeric = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value?.toMillis === 'function') {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    try {
      const num = value.toNumber();
      return Number.isFinite(num) ? num : null;
    } catch (_error) {
      return null;
    }
  }
  if (value && typeof value === 'object' && ('low' in value || 'high' in value)) {
    const num = Number(value.low || value.high || 0);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const canonicalizeJid = (rawJid) => {
  if (!rawJid || typeof rawJid !== 'string') {
    return { canonicalJid: null, peerType: 'unknown', isGroup: false, rawJid: rawJid || null };
  }

  const trimmed = rawJid.trim().toLowerCase();
  if (!trimmed) {
    return { canonicalJid: null, peerType: 'unknown', isGroup: false, rawJid };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { canonicalJid: trimmed, peerType: 'unknown', isGroup: false, rawJid };
  }

  let [userPart, domain] = parts;
  if (!userPart || !domain) {
    return { canonicalJid: trimmed, peerType: 'unknown', isGroup: false, rawJid };
  }

  if (/^\+\d+$/.test(userPart)) {
    userPart = userPart.slice(1);
  }

  if (userPart.includes(':')) {
    const [base, suffix] = userPart.split(':');
    if (/^\d+$/.test(suffix) || /^device$/i.test(suffix)) {
      userPart = base;
    }
  }

  if (domain === 'c.us') {
    domain = 's.whatsapp.net';
  }

  const canonicalJid = `${userPart}@${domain}`;
  const isGroup = domain === 'g.us';
  const peerType = isGroup ? 'group' : domain === 'lid' ? 'lid' : 'user';

  return { canonicalJid, peerType, isGroup, rawJid };
};

const buildCanonicalThreadId = (accountId, canonicalJid) => {
  if (!accountId || !canonicalJid) return null;
  return `${accountId}__${canonicalJid}`;
};

const computeTsClient = (input) => {
  const source = input || {};
  let tsClientMs = null;

  if (source.tsClientMs != null) {
    tsClientMs = normalizeNumeric(source.tsClientMs);
  }

  if (tsClientMs == null && source.tsClientAt) {
    tsClientMs = normalizeNumeric(source.tsClientAt);
  }

  if (tsClientMs == null && source.tsClient) {
    tsClientMs = normalizeNumeric(source.tsClient);
  }

  if (tsClientMs == null && source.tsClientIso) {
    const parsed = Date.parse(source.tsClientIso);
    tsClientMs = Number.isFinite(parsed) ? parsed : null;
  }

  if (tsClientMs == null && source.messageTimestamp != null) {
    const ts = normalizeNumeric(source.messageTimestamp);
    if (ts != null) {
      tsClientMs = ts > 1e12 ? ts : ts * 1000;
    }
  }

  const tsClientFallback = tsClientMs == null;
  const tsClientReason = tsClientFallback ? 'missing_messageTimestamp' : null;
  const tsClientAt =
    tsClientMs != null && admin?.firestore?.Timestamp
      ? admin.firestore.Timestamp.fromMillis(tsClientMs)
      : null;

  return {
    tsClientAt,
    tsClientMs,
    tsClientFallback,
    tsClientReason,
  };
};

module.exports = {
  canonicalizeJid,
  buildCanonicalThreadId,
  computeTsClient,
  safeHash,
};
