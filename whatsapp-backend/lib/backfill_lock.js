/**
 * Distributed lock per account for WhatsApp backfill.
 * Collection: whatsapp_backfill_locks/{accountId}
 * Fields: ownerId, expiresAt (Timestamp or expiresAtMs number), startedAt
 * - If lock exists and not expired, skip (busy or another instance).
 * - Acquire: set ownerId, expiresAtMs (ms since epoch), startedAt; release: delete doc.
 */

const LOCK_COLLECTION = 'whatsapp_backfill_locks';

function toDate(v) {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return new Date(v.toMillis());
  if (v._seconds != null) return new Date((v._seconds || 0) * 1000);
  if (v instanceof Date) return v;
  return null;
}

function getExpiresAtMs(d) {
  if (d.expiresAtMs != null && typeof d.expiresAtMs === 'number') return d.expiresAtMs;
  const dt = toDate(d.expiresAt);
  return dt ? dt.getTime() : null;
}

/**
 * Acquire lock for accountId. Returns true if acquired.
 * @param {import('@google-cloud/firestore').Firestore} db
 * @param {string} accountId
 * @param {string} ownerId - instance id
 * @param {number} leaseMs - lock duration ms
 * @param {() => object} timestamp - serverTimestamp() for startedAt
 * @returns {Promise<boolean>}
 */
async function acquireLock(db, accountId, ownerId, leaseMs, timestamp) {
  if (!db || !accountId) return false;
  const ref = db.collection(LOCK_COLLECTION).doc(accountId);
  const now = Date.now();
  const expiresAtMs = now + leaseMs;

  try {
    let acquired = false;
    await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const d = snap.exists ? snap.data() : {};
      const existingMs = getExpiresAtMs(d);
      if (existingMs != null && existingMs > now) {
        return; // Lock busy
      }
      t.set(ref, {
        ownerId: ownerId || 'unknown',
        expiresAtMs,
        startedAt: timestamp ? timestamp() : now,
      });
      acquired = true;
    });
    if (acquired) {
      console.log(`📚 [backfill-lock] ${maskId(accountId)} acquired owner=${ownerId}`);
    } else {
      console.log(`📚 [backfill-lock] ${maskId(accountId)} busy (existing lock not expired)`);
    }
    return acquired;
  } catch (e) {
    console.warn(`📚 [backfill-lock] ${maskId(accountId)} acquire error:`, e.message);
    return false;
  }
}

/**
 * Release lock (best-effort). Delete doc so next run can acquire.
 * @param {import('@google-cloud/firestore').Firestore} db
 * @param {string} accountId
 */
async function releaseLock(db, accountId) {
  if (!db || !accountId) return;
  const ref = db.collection(LOCK_COLLECTION).doc(accountId);
  try {
    await ref.delete();
    console.log(`📚 [backfill-lock] ${maskId(accountId)} released`);
  } catch (e) {
    console.warn(`📚 [backfill-lock] ${maskId(accountId)} release error:`, e.message);
  }
}

/**
 * Check if lock exists and is not expired.
 * @param {import('@google-cloud/firestore').Firestore} db
 * @param {string} accountId
 * @returns {Promise<{ busy: boolean; ownerId?: string; expiresAt?: Date }>}
 */
async function checkLock(db, accountId) {
  if (!db || !accountId) return { busy: false };
  const ref = db.collection(LOCK_COLLECTION).doc(accountId);
  try {
    const snap = await ref.get();
    if (!snap.exists) return { busy: false };
    const d = snap.data() || {};
    const expiresAtMs = getExpiresAtMs(d);
    const now = Date.now();
    if (expiresAtMs != null && expiresAtMs > now) {
      return { busy: true, ownerId: d.ownerId, expiresAt: expiresAtMs };
    }
    return { busy: false }; // Expired
  } catch (e) {
    return { busy: false };
  }
}

function maskId(id) {
  if (!id || typeof id !== 'string') return '?';
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '...';
}

module.exports = {
  acquireLock,
  releaseLock,
  checkLock,
  LOCK_COLLECTION,
  maskId,
};
