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
  state.lock = new Promise(r => {
    resolve = r;
  });
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
async function fetchSingleBatch(sock, resolvedJid, count, oldestMsgKey, jid) {
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
      console.warn(
        `[fetch-messages-wa] Timeout waiting for history: jid=${jid} resolvedJid=${resolvedJid} anchor=${oldestMsgKey ? 'yes' : 'none'}`
      );
      resolve([]);
    }, FETCH_TIMEOUT_MS);

    const handler = data => {
      if (settled) return;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      // Filter by resolvedJid
      const forJid = messages.filter(
        m => m?.key?.remoteJid === resolvedJid || m?.key?.remoteJid === jid
      );
      if (forJid.length > 0) {
        clearTimeout(timeout);
        settled = true;
        ev.off('messaging-history.set', handler);

        const anchorType = oldestMsgKey ? 'yes' : 'none';
        console.log(
          `[fetch-messages-wa] anchor=${anchorType} jid=${jid} resolvedJid=${resolvedJid} messagesFetched=${forJid.length}`
        );
        resolve(forJid);
      }
    };

    ev.on('messaging-history.set', handler);

    sock.fetchMessageHistory(resolvedJid, count, oldestMsgKey).then(
      () => {
        if (!oldestMsgKey) {
          console.log(
            `[fetch-messages-wa] Fallback fetch triggered: anchor=none jid=${jid} resolvedJid=${resolvedJid}`
          );
        }
      },
      err => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          ev.off('messaging-history.set', handler);
          console.error(
            `[fetch-messages-wa] Error fetching history for ${resolvedJid}:`,
            err.message
          );
          resolve([]);
        }
      }
    );
  });
}

/**
 * Fetch messages older than oldest we have for a chat. Uses sock.fetchMessageHistory
 * and messaging-history.set. Handles empty threads by seeding with latest history.
 *
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID (remoteJid)
 * @param {number} limit - Max messages to request (max 50 per Baileys)
 * @param {{ db?: FirebaseFirestore.Firestore; accountId?: string; maxDepth?: number }} [opts]
 * @returns {Promise<object[]>} Baileys WAMessage[]
 */
async function fetchMessagesFromWA(sock, jid, limit, opts = {}) {
  if (!sock || typeof sock !== 'object') {
    throw new Error('fetchMessagesFromWA: sock is required');
  }
  if (typeof sock.fetchMessageHistory !== 'function') {
    throw new Error(
      'fetchMessagesFromWA: sock.fetchMessageHistory is not a function (Baileys socket)'
    );
  }

  const { db, accountId, maxDepth = 1 } = opts;
  if (!db || !accountId) {
    return [];
  }

  fetchStats.threadsProcessed++;

  // 1) Resolve JID
  const { resolveCanonicalJid } = require('./jid-utils');
  const resolution = await resolveCanonicalJid(sock, jid);
  const resolvedJid = resolution.canonicalJid || jid;

  if (jid.endsWith('@lid') && resolution.canonicalJid) {
    console.log(`[fetch-messages-wa] LID resolved: ${jid} -> ${resolvedJid}`);
  }

  // 2) Find anchor
  const threadId = `${accountId}__${jid}`;
  const ref = db.collection('threads').doc(threadId).collection('messages');
  const oldestSnap = await ref.orderBy('tsClient', 'asc').limit(1).get();

  let oldestMsgKey = undefined;
  let reason = oldestSnap.empty ? 'empty_thread' : 'none';

  if (!oldestSnap.empty) {
    const doc = oldestSnap.docs[0];
    const d = doc.data();
    const { extractWaKeyId, extractWaMetadata } = require('./extract-wa-key-id');
    const extracted = extractWaKeyId(d, doc.id);
    const waKeyId = extracted.waKeyId;

    if (waKeyId) {
      const { waRemoteJid, waFromMe } = extractWaMetadata(d, doc.id);
      const fromMe = waFromMe ?? (d.direction === 'out' || d.key?.fromMe || false);

      oldestMsgKey = {
        remoteJid: waRemoteJid || resolvedJid,
        fromMe,
        id: waKeyId,
      };
    } else {
      reason = 'invalid_anchor';
    }
  }

  const count = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 50);

  return withMutex(sock, async () => {
    const allFetched = [];

    // First fetch (seed if no anchor)
    if (!oldestMsgKey) {
      console.log(
        `[seed] threadId=${threadId}, jid=${jid}, resolvedJid=${resolvedJid}, reason=${reason}`
      );
    }

    const batch1 = await fetchSingleBatch(sock, resolvedJid, count, oldestMsgKey, jid);
    if (batch1.length > 0) {
      allFetched.push(...batch1);
      fetchStats.messagesFetched += batch1.length;

      // Optionally attempt older-than-oldest using the new oldest from batch1
      if (maxDepth > 0) {
        // Find oldest in batch1 to use as anchor for batch2
        // Baileys messages are often newest first? Or oldest first?
        // fetchMessageHistory usually returns from current anchor backwards.
        // If we seeded (anchor=none), we got the latest N. The oldest is at the END of array typically.
        const sorted = [...batch1].sort((a, b) => {
          const tA = Number(a.messageTimestamp) || 0;
          const tB = Number(b.messageTimestamp) || 0;
          return tA - tB;
        });
        const oldestEntry = sorted[0];
        const newAnchor = {
          remoteJid: oldestEntry.key.remoteJid,
          fromMe: oldestEntry.key.fromMe,
          id: oldestEntry.key.id,
        };

        if (newAnchor.id !== oldestMsgKey?.id) {
          const batch2 = await fetchSingleBatch(sock, resolvedJid, count, newAnchor, jid);
          if (batch2.length > 0) {
            allFetched.push(...batch2);
            fetchStats.messagesFetched += batch2.length;
          }
        }
      }
    }

    return allFetched;
  });
}

module.exports = {
  fetchMessagesFromWA,
  resetFetchStats,
  getFetchStats,
};
