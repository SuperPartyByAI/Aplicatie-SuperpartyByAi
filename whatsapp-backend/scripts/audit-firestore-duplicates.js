#!/usr/bin/env node

const crypto = require('crypto');
const admin = require('firebase-admin');
const { normalizeMessageText, safeHash } = require('../lib/wa-message-identity');

const toSha1 = (value) =>
  crypto.createHash('sha1').update(String(value)).digest('hex');

const shortHash = (value) => toSha1(value).slice(0, 8);

const parseArgs = (argv) => {
  const opts = {
    limit: 500,
    windowHours: 48,
    dryRun: false,
    threadId: '',
    excludeMarked: true,
    includeMarked: false,
    keyMode: 'stable',
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
      continue;
    }
    if (arg === '--excludeMarked') {
      opts.excludeMarked = true;
      opts.includeMarked = false;
      continue;
    }
    if (arg === '--includeMarked') {
      opts.excludeMarked = false;
      opts.includeMarked = true;
      continue;
    }
    if (arg.startsWith('--keyMode=')) {
      const val = arg.split('=')[1];
      if (val === 'stable' || val === 'fallback') opts.keyMode = val;
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

const pickTimestampMs = (data) =>
  normalizeTs(data.tsClientMs) ||
  normalizeTs(data.tsClientAt) ||
  normalizeTs(data.tsClient) ||
  normalizeTs(data.ingestedAt) ||
  null;

const getDirection = (data) => {
  if (data.direction) return data.direction;
  if (data.fromMe === true) return 'outbound';
  if (data.fromMe === false) return 'inbound';
  return 'unknown';
};

const buildStableFallbackFingerprint = ({ data, tsClientMs }) => {
  const direction = getDirection(data);
  const senderJid = data.senderJid || data.participant || data.from || '';
  const messageType = data.messageType || data.type || 'unknown';
  const normalizedText = normalizeMessageText({ body: data.body, message: data.message || {} });
  const textHash = safeHash(normalizedText || '');
  const seed = `${direction}|${senderJid}|${tsClientMs || 'unknown'}|${messageType}|${textHash}`;
  return toSha1(seed);
};

const buildLegacyFingerprint = ({ data, tsClientMs }) => {
  const direction = getDirection(data);
  const messageType = data.messageType || data.type || 'unknown';
  const normalizedText = normalizeMessageText({ body: data.body, message: data.message || {} });
  const bodyHash = safeHash(normalizedText || '');
  const seed = `${direction}|${tsClientMs || 'unknown'}|${bodyHash}|${messageType}`;
  return toSha1(seed);
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

  const activeGroups = new Map();
  const allGroups = new Map();
  let totalDocs = 0;
  let markedDocs = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const tsClientMs = pickTimestampMs(data);

    if (tsClientMs && tsClientMs < cutoffMs) {
      continue;
    }

    totalDocs += 1;
    if (data.isDuplicate === true) {
      markedDocs += 1;
    }

    const key =
      opts.keyMode === 'fallback'
        ? buildLegacyFingerprint({ data, tsClientMs })
        : data.stableKeyHash ||
          data.fingerprintHash ||
          buildStableFallbackFingerprint({ data, tsClientMs });

    const entry = {
      key,
      size: 0,
      docIds: [],
      minTs: null,
      maxTs: null,
    };

    const targetGroups = data.isDuplicate === true && opts.excludeMarked ? null : activeGroups;

    const addToGroup = (groups) => {
      const existing = groups.get(key) || { ...entry };
      existing.size += 1;
      if (existing.docIds.length < 3) {
        existing.docIds.push(shortHash(doc.id));
      }
      if (tsClientMs) {
        existing.minTs = existing.minTs ? Math.min(existing.minTs, tsClientMs) : tsClientMs;
        existing.maxTs = existing.maxTs ? Math.max(existing.maxTs, tsClientMs) : tsClientMs;
      }
      groups.set(key, existing);
    };

    if (targetGroups) addToGroup(targetGroups);
    addToGroup(allGroups);
  }

  const activeEntries = Array.from(activeGroups.values());
  const allEntries = Array.from(allGroups.values());
  const duplicatesCountActive = activeEntries.reduce(
    (sum, entry) => sum + (entry.size > 1 ? entry.size - 1 : 0),
    0
  );
  const duplicatesCountAll = allEntries.reduce(
    (sum, entry) => sum + (entry.size > 1 ? entry.size - 1 : 0),
    0
  );

  const selectedEntries = opts.includeMarked ? allEntries : activeEntries;
  const topGroups = selectedEntries
    .filter((entry) => entry.size > 1)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map((entry) => ({
      keyHash: shortHash(entry.key),
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
      markedDocs,
      activeDocs: totalDocs - markedDocs,
      uniqueKeys: selectedEntries.length,
      duplicatesCountActive,
      duplicatesCountAll: opts.includeMarked ? duplicatesCountAll : null,
      topGroups,
      windowHours: opts.windowHours,
      limit: opts.limit,
      keyMode: opts.keyMode,
      excludeMarked: opts.excludeMarked,
      dryRun: opts.dryRun,
    })
  );

  process.exit(duplicatesCountActive === 0 ? 0 : 2);
})();
