const crypto = require('crypto');

const sha1 = (value) => crypto.createHash('sha1').update(String(value)).digest('hex');
const safeHash = (value) => sha1(value).slice(0, 8);

const normalizeMessageText = (msg) => {
  if (!msg) return '';
  if (typeof msg.body === 'string') {
    return msg.body.trim().replace(/\s+/g, ' ');
  }

  const message = msg.message || {};
  const content =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.ephemeralMessage?.message?.conversation ||
    message.ephemeralMessage?.message?.extendedTextMessage?.text ||
    message.viewOnceMessage?.message?.conversation ||
    message.viewOnceMessage?.message?.extendedTextMessage?.text ||
    '';

  if (typeof content !== 'string') return '';
  return content.trim().replace(/\s+/g, ' ');
};

const getMessageType = (msg) => {
  if (!msg) return 'unknown';
  if (msg.messageType) return msg.messageType;
  const message = msg.message || {};
  if (message.conversation || message.extendedTextMessage?.text) return 'text';
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  return 'unknown';
};

const getSenderJid = ({ msg, isGroup }) => {
  if (!msg || !isGroup) return null;
  return msg.key?.participant || msg.participant || msg.senderJid || null;
};

const getStableKey = ({ accountId, canonicalJid, msg }) => {
  if (!accountId || !canonicalJid || !msg?.key?.id) return null;
  const fromMe = msg.key?.fromMe ? '1' : '0';
  const participant = msg.key?.participant || msg.participant || '';
  return `${accountId}|${canonicalJid}|${msg.key.id}|${fromMe}|${participant}`;
};

const getStrongFingerprint = ({ accountId, canonicalJid, msg, tsClientMs }) => {
  if (!accountId || !canonicalJid || !msg) return null;
  const senderJid = getSenderJid({ msg, isGroup: Boolean(msg.key?.remoteJid?.endsWith('@g.us')) });
  const direction = msg.key?.fromMe ? 'outbound' : 'inbound';
  const bodyHash = safeHash(normalizeMessageText(msg));
  const messageType = getMessageType(msg);
  const seed = `${canonicalJid}|${direction}|${senderJid || ''}|${tsClientMs || 'unknown'}|${messageType}|${bodyHash}`;
  return sha1(seed);
};

const chooseDocId = ({ stableKey, strongFingerprint }) => {
  if (stableKey) return sha1(stableKey).slice(0, 24);
  if (strongFingerprint) return sha1(strongFingerprint).slice(0, 24);
  return null;
};

module.exports = {
  normalizeMessageText,
  getMessageType,
  getSenderJid,
  getStableKey,
  getStrongFingerprint,
  chooseDocId,
  safeHash,
};
