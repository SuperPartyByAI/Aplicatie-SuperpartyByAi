#!/usr/bin/env node

const crypto = require('crypto');
const admin = require('firebase-admin');
const { coerceToMs } = require('./audit-firestore-duplicates');

const hash8 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);

const classifyTsString = (value) => {
  if (typeof value !== 'string') return 'other';
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length === 10) return 'digits10';
    if (trimmed.length === 13) return 'digits13';
    return 'digits_other';
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? 'iso' : 'other';
};

const ageBucketFromMs = (ageMs) => {
  if (!Number.isFinite(ageMs)) return 'unknown';
  if (ageMs < 15 * 60 * 1000) return 'lt15m';
  if (ageMs < 6 * 60 * 60 * 1000) return 'lt6h';
  if (ageMs < 48 * 60 * 60 * 1000) return 'lt48h';
  return 'ge48h';
};

const initFirestore = () => {
  try {
    if (!admin.apps.length) {
      const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (gacPath) {
        const serviceAccount = require(gacPath);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else {
        admin.initializeApp();
      }
    }
    return { db: admin.firestore(), error: null };
  } catch (error) {
    return { db: null, error };
  }
};

(async () => {
  const { db, error } = initFirestore();
  if (!db) {
    console.log(JSON.stringify({ error: error?.message || 'firestore_unavailable' }));
    process.exit(1);
  }

  const nowMs = Date.now();
  const stats = {
    scanned: 0,
    parseOk: 0,
    parseFail: 0,
    categories: {},
    buckets: {},
    lenTop: {},
  };

  const sample = [];
  const snap = await db.collectionGroup('messages').orderBy('tsClient', 'desc').limit(20).get();
  stats.scanned = snap.size;

  let i = 0;
  for (const doc of snap.docs) {
    const tsClient = doc.get('tsClient');
    const tsString = tsClient === null || tsClient === undefined ? '' : String(tsClient);
    const tsLen = tsString.length;
    const category = classifyTsString(tsString);
    const tsMs = coerceToMs(tsClient);
    const parseOk = Number.isFinite(tsMs);
    const ageBucket = parseOk ? ageBucketFromMs(nowMs - tsMs) : 'unknown';

    const pathHash8 = hash8(doc.ref.path);
    const tsHash8 = tsString ? hash8(tsString) : null;

    sample.push({
      pathHash8,
      tsLen,
      tsHash8,
      category,
      parseOk,
      ageBucket,
    });

    stats.categories[category] = (stats.categories[category] || 0) + 1;
    stats.buckets[ageBucket] = (stats.buckets[ageBucket] || 0) + 1;
    stats.lenTop[String(tsLen)] = (stats.lenTop[String(tsLen)] || 0) + 1;
    if (parseOk) stats.parseOk += 1;
    else stats.parseFail += 1;
    i += 1;
  }

  console.log(JSON.stringify({ sample, stats }));
  process.exit(0);
})().catch((err) => {
  console.log(JSON.stringify({ error: err?.message || 'probe_failed' }));
  process.exit(1);
});
