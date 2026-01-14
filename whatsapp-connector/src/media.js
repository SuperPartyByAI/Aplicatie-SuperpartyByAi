const crypto = require('crypto');
const path = require('path');

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const { getBucket } = require('./firestore');

function sha256Base64(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

function randomToken() {
  return crypto.randomUUID();
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

function detectMedia(msg) {
  const m = msg?.message || {};
  if (m.imageMessage) return { kind: 'image', content: m.imageMessage, ext: 'jpg', mime: m.imageMessage.mimetype };
  if (m.videoMessage) return { kind: 'video', content: m.videoMessage, ext: 'mp4', mime: m.videoMessage.mimetype };
  if (m.audioMessage) return { kind: 'audio', content: m.audioMessage, ext: 'ogg', mime: m.audioMessage.mimetype };
  if (m.documentMessage)
    return { kind: 'document', content: m.documentMessage, ext: 'bin', mime: m.documentMessage.mimetype, fileName: m.documentMessage.fileName };
  return null;
}

async function uploadMediaToStorage({ threadId, waMessageKey, msg }) {
  const det = detectMedia(msg);
  if (!det) return null;

  const bucket = getBucket();
  const stream = await downloadContentFromMessage(det.content, det.kind);
  const buf = await streamToBuffer(stream);

  const safeName =
    det.fileName && det.fileName.trim()
      ? det.fileName.trim()
      : `media.${det.ext || 'bin'}`;

  const storagePath = `whatsapp_media/${threadId}/${waMessageKey}/${safeName}`;
  const file = bucket.file(storagePath);

  const token = randomToken();
  const sha256 = sha256Base64(buf);

  await file.save(buf, {
    resumable: false,
    metadata: {
      contentType: det.mime || 'application/octet-stream',
      metadata: {
        firebaseStorageDownloadTokens: token,
        sha256,
      },
    },
  });

  const encoded = encodeURIComponent(storagePath);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;

  return {
    type: det.kind,
    url,
    mime: det.mime || null,
    size: buf.length,
    thumbnailUrl: null,
    durationSec: det.content?.seconds || null,
    fileName: safeName,
    sha256,
    storagePath,
  };
}

module.exports = {
  detectMedia,
  uploadMediaToStorage,
};

