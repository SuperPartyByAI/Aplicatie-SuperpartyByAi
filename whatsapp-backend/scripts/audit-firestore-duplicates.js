#!/usr/bin/env node

const crypto = require('crypto');
const admin = require('firebase-admin');

const toSha1 = (value) =>
  crypto.createHash('sha1').update(String(value)).digest('hex');

const shortHash = (value) => toSha1(value).slice(0, 8);

const parseArgs = (argv) => {
  const opts = {
    limit: 500,
    windowHours: 48,
    dryRun: false,
    threadId: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--threadId=')) {
      opts.threadId = arg.split('=')[1] || '';
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.limit = val;
      continue;
    }
    if (arg.startsWith('--windowHours=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.windowHours = val;
      continue;
    }
    if (arg === '--dryRun') {
      opts.dryRun = true;
    }
  }

  return opts;
};

const normalizeTs = (value) => {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) return num < 1e12 ? num * 1000 : num;
  }
  return null;
};

const initFirestore = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { db: null, error: 'Firestore not available' };

  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return { db: admin.firestore(), error: null };
  } catch (error) {
    return { db: null, error: 'Firestore not available' };
  }
};

(async () => {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.threadId) {
    console.error('Missing --threadId');
    process.exit(1);
  }

  const { db, error } = initFirestore();
  if (!db) {
    console.log(error);
    process.exit(1);
  }

  const nowMs = Date.now();
  const cutoffMs = nowMs - opts.windowHours * 60 * 60 * 1000;

  const snapshot = await db
    .collection('threads')
    .doc(opts.threadId)
    .collection('messages')
    .orderBy('tsClient', 'desc')
    .limit(opts.limit)
    .get();

  const groups = new Map();
  let totalDocs = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const tsClientMs = normalizeTs(data.tsClient);

    if (tsClientMs && tsClientMs < cutoffMs) {
      continue;
    }

    totalDocs += 1;

    const direction =
      data.direction ||
      (data.fromMe === true ? 'outbound' : data.fromMe === false ? 'inbound' : 'unknown');
    const body = data.body ?? data.message ?? '';
    const bodyHash = shortHash(body || '');
    const messageType = data.messageType || data.type || 'unknown';

    const fingerprintSeed = `${direction}|${tsClientMs ?? 'unknown'}|${bodyHash}|${messageType}`;
    const fp = toSha1(fingerprintSeed);

    const entry = groups.get(fp) || {
      fp,
      size: 0,
      docIds: [],
      minTs: null,
      maxTs: null,
    };

    entry.size += 1;
    if (entry.docIds.length < 3) {
      entry.docIds.push(shortHash(doc.id));
    }
    if (tsClientMs) {
      entry.minTs = entry.minTs ? Math.min(entry.minTs, tsClientMs) : tsClientMs;
      entry.maxTs = entry.maxTs ? Math.max(entry.maxTs, tsClientMs) : tsClientMs;
    }

    groups.set(fp, entry);
  }

  const entries = Array.from(groups.values());
  const duplicatesCount = entries.reduce(
    (sum, entry) => sum + (entry.size > 1 ? entry.size - 1 : 0),
    0
  );

  const topGroups = entries
    .filter((entry) => entry.size > 1)
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)
    .map((entry) => ({
      fp: entry.fp,
      size: entry.size,
      sampleDocIds: entry.docIds,
      tsClientRange:
        entry.minTs && entry.maxTs
          ? {
              min: new Date(entry.minTs).toISOString(),
              max: new Date(entry.maxTs).toISOString(),
            }
          : 'unknown',
    }));

  console.log(
    JSON.stringify({
      totalDocs,
      uniqueFingerprints: entries.length,
      duplicatesCount,
      topGroups,
      windowHours: opts.windowHours,
      limit: opts.limit,
      dryRun: opts.dryRun,
    })
  );

  process.exit(duplicatesCount === 0 ? 0 : 2);
})();
