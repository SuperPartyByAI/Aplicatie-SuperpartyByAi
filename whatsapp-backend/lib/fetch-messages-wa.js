/**
 * Fetch messages from WhatsApp via Baileys fetchMessageHistory.
 * Uses messaging-history.set event; requires oldest message in Firestore for the thread.
 * Serialized per sock (mutex) to avoid mixing concurrent history responses.
 */

const FETCH_TIMEOUT_MS = 15000;

/** @type {WeakMap<object, { lock: Promise<void> }>} */
const fetchMutexBySock = new WeakMap();

// Aggregated stats for logging
let fetchStats = {
  threadsProcessed: 0,
  threadsNoAnchorKeyId: 0,
  messagesFetched: 0,
  errors: 0,
};

function resetFetchStats() {
  fetchStats = {
    threadsProcessed: 0,
    threadsNoAnchorKeyId: 0,
    messagesFetched: 0,
    errors: 0,
  };
}

function getFetchStats() {
  return { ...fetchStats };
}

async function withMutex(sock, fn) {
  let state = fetchMutexBySock.get(sock);
  if (!state) {
    state = { lock: Promise.resolve() };
    fetchMutexBySock.set(sock, state);
  }
  const prev = state.lock;
  let resolve;
  state.lock = new Promise((r) => { resolve = r; });
  try {
    await prev;
    return await fn();
  } finally {
    resolve();
  }
}

/**
 * Fetch messages older than oldest we have for a chat. Uses sock.fetchMessageHistory
 * and messaging-history.set. Returns [] when no oldest message in Firestore.
 *
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID (remoteJid)
 * @param {number} limit - Max messages to request (max 50 per Baileys)
 * @param {{ db?: FirebaseFirestore.Firestore; accountId?: string }} [opts]
 * @returns {Promise<object[]>} Baileys WAMessage[] (with .key, .message)
 */
async function fetchMessagesFromWA(sock, jid, limit, opts = {}) {
  if (!sock || typeof sock !== 'object') {
    throw new Error('fetchMessagesFromWA: sock is required');
  }
  if (typeof sock.fetchMessageHistory !== 'function') {
    throw new Error('fetchMessagesFromWA: sock.fetchMessageHistory is not a function (Baileys socket)');
  }

  const { db, accountId } = opts;
  if (!db || !accountId) {
    return [];
  }

  fetchStats.threadsProcessed++;

  const threadId = `${accountId}__${jid}`;
  const ref = db.collection('threads').doc(threadId).collection('messages');
  const oldestSnap = await ref.orderBy('tsClient', 'asc').limit(1).get();
  if (oldestSnap.empty) {
    return [];
  }

  const doc = oldestSnap.docs[0];
  const d = doc.data();
  const oldestDocData = d; // Keep reference for timestamp fallback
  
  // CRITICAL: fetchMessageHistory requires the original WhatsApp message ID (msg.key.id)
  // Extract waKeyId and metadata using standardized extraction function
  const { extractWaKeyId, extractWaMetadata } = require('./extract-wa-key-id');
  const { waKeyId, source } = extractWaKeyId(d, doc.id);
  
  if (!waKeyId) {
    // No valid waKeyId found - cannot construct oldestMsgKey
    fetchStats.threadsNoAnchorKeyId++;
    console.warn(`[fetch-messages-wa] No waKeyId found for thread ${threadId} (source: ${source}). Skipping fetchMessageHistory.`);
    return [];
  }
  
  // Log if using fallback (for debugging)
  if (source === 'doc.id_fallback') {
    console.log(`[fetch-messages-wa] Using doc.id as waKeyId fallback for thread ${threadId}`);
  }
  
  const originalMessageId = waKeyId;
  
  // Extract metadata using standardized function
  const { waRemoteJid, waFromMe, waTimestampSec } = extractWaMetadata(d, doc.id);
  
  const fromMe = waFromMe ?? (d.direction === 'out' || d.key?.fromMe || false);
  
  // Extract timestamp in seconds (fetchMessageHistory expects seconds, not milliseconds)
  // Use helper functions for robust timestamp extraction with fallback
  const { pickOldestTimestamp } = require('./extract-wa-key-id');
  
  let tsSec = null;
  if (waTimestampSec != null) {
    tsSec = waTimestampSec;
  } else {
    // Try to derive from document data
    tsSec = pickOldestTimestamp(oldestDocData);
  }
  
  // Final fallback: 7 days ago (reasonable for backfill without blocking)
  if (tsSec == null) {
    tsSec = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
    console.log(`[fetch-messages-wa] Using fallback timestamp (7 days ago) for thread ${threadId}`);
  }

  const oldestMsgKey = { 
    remoteJid: waRemoteJid || jid, 
    fromMe, 
    id: originalMessageId 
  };
  
  console.log(`[fetch-messages-wa] Using anchor: threadId=${threadId} waKeyId=${originalMessageId.substring(0, 20)}... source=${source} fromMe=${fromMe} tsSec=${tsSec}`);
  const count = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 50);

  return withMutex(sock, async () => {
    return new Promise((resolve, reject) => {
      const ev = sock.ev;
      if (!ev || typeof ev.on !== 'function') {
        resolve([]);
        return;
      }

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        ev.off('messaging-history.set', handler);
        resolve([]);
      }, FETCH_TIMEOUT_MS);

      const handler = (data) => {
        if (settled) return;
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const forJid = messages.filter((m) => m?.key?.remoteJid === jid);
        if (forJid.length > 0) {
          clearTimeout(timeout);
          settled = true;
          ev.off('messaging-history.set', handler);
          fetchStats.messagesFetched += forJid.length;
          console.log(`[fetch-messages-wa] Fetched ${forJid.length} messages for thread ${threadId}`);
          resolve(forJid);
        }
      };

      ev.on('messaging-history.set', handler);

      sock.fetchMessageHistory(count, oldestMsgKey, tsSec).then(
        () => { /* response comes via event */ },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            ev.off('messaging-history.set', handler);
            fetchStats.errors++;
            reject(err);
          }
        }
      );
    });
  });
}

module.exports = {
  fetchMessagesFromWA,
  resetFetchStats,
  getFetchStats,
};
