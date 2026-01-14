const { getDb, getAdmin } = require('./firestore');

const LEASES_COL = 'whatsapp_account_leases';

function nowMs() {
  return Date.now();
}

async function claimLease({ accountId, instanceId, leaseMs }) {
  const db = getDb();
  const admin = getAdmin();
  const ref = db.collection(LEASES_COL).doc(accountId);
  const now = admin.firestore.Timestamp.fromMillis(nowMs());
  const until = admin.firestore.Timestamp.fromMillis(nowMs() + leaseMs);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    const leaseUntil = data?.leaseUntil;
    const owner = (data?.ownerInstanceId || '').toString();

    const isExpired =
      !leaseUntil ||
      (leaseUntil.toMillis ? leaseUntil.toMillis() : 0) < now.toMillis();

    if (snap.exists && !isExpired && owner && owner !== instanceId) {
      return { ok: false, reason: 'lease_held', ownerInstanceId: owner };
    }

    tx.set(
      ref,
      {
        ownerInstanceId: instanceId,
        leaseUntil: until,
        updatedAt: now,
      },
      { merge: true },
    );

    return { ok: true, ownerInstanceId: instanceId, leaseUntil: until };
  });
}

async function renewLease({ accountId, instanceId, leaseMs }) {
  const db = getDb();
  const admin = getAdmin();
  const ref = db.collection(LEASES_COL).doc(accountId);
  const now = admin.firestore.Timestamp.fromMillis(nowMs());
  const until = admin.firestore.Timestamp.fromMillis(nowMs() + leaseMs);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'missing' };
    const data = snap.data() || {};
    const owner = (data.ownerInstanceId || '').toString();
    if (owner !== instanceId) return { ok: false, reason: 'not_owner', owner };

    tx.set(ref, { leaseUntil: until, updatedAt: now }, { merge: true });
    return { ok: true, leaseUntil: until };
  });
}

async function releaseLease({ accountId, instanceId }) {
  const db = getDb();
  const admin = getAdmin();
  const ref = db.collection(LEASES_COL).doc(accountId);
  const now = admin.firestore.Timestamp.fromMillis(nowMs());
  const until = admin.firestore.Timestamp.fromMillis(nowMs() - 1);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data() || {};
      const owner = (data.ownerInstanceId || '').toString();
      if (owner !== instanceId) return;
      tx.set(ref, { leaseUntil: until, updatedAt: now }, { merge: true });
    });
  } catch (_) {
    // best effort
  }
}

module.exports = {
  claimLease,
  renewLease,
  releaseLease,
};

