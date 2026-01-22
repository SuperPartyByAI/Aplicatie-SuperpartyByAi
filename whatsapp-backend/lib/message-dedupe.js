const crypto = require('crypto');

function buildMessageDedupeKey(message) {
  const waMessageId = message?.waMessageId || message?.id || null;
  if (waMessageId) {
    return `wa:${waMessageId}`;
  }

  const requestId = message?.requestId || message?.clientMessageId || null;
  if (requestId) {
    return `req:${requestId}`;
  }

  const direction = message?.direction || 'inbound';
  const body = (message?.body || '').trim();
  const tsClient = message?.tsClient || message?.timestamp || null;
  let tsSeconds = null;
  if (typeof tsClient === 'number') {
    tsSeconds = Math.floor(tsClient / 1000);
  } else if (tsClient && typeof tsClient.toMillis === 'function') {
    tsSeconds = Math.floor(tsClient.toMillis() / 1000);
  } else if (typeof tsClient === 'string') {
    tsSeconds = Math.floor(new Date(tsClient).getTime() / 1000);
  }

  const base = `${direction}|${body}|${tsSeconds || 'na'}`;
  const hash = crypto.createHash('sha256').update(base).digest('hex');
  return `hash:${hash}`;
}

module.exports = {
  buildMessageDedupeKey,
};
