#!/usr/bin/env node

const crypto = require('crypto');
const admin = require('firebase-admin');
const { normalizeMessageText, safeHash } = require('../lib/wa-message-identity');

const sha1 = (value) => crypto.createHash('sha1').update(String(value)).digest('hex');
const shortHash = (value) => sha1(value).slice(0, 8);

const parseArgs = (argv) => {
  const opts = {
    threadId: '',
    windowHours: 48,
    limit: 2000,
    apply: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--threadId=')) {
      opts.threadId = arg.split('=')[1] || '';
      continue;
    }
    if (arg.startsWith('--windowHours=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.windowHours = val;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.limit = val;
      continue;
    }
    if (arg === '--apply') {
      opts.apply = true;
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
  normalizeTs(data.createdAt) ||
  null;

const getDirection = (data) => {
  if (data.direction) return data.direction;
  if (data.fromMe === true) return 'outbound';
  if (data.fromMe === false) return 'inbound';
  return 'unknown';
};

const buildFallbackFingerprint = ({ data, tsClientMs }) => {
  const direction = getDirection(data);
  const senderJid = data.senderJid || data.participant || data.from || '';
  const messageType = data.messageType || data.type || 'unknown';
  const normalizedText = normalizeMessageText({ body: data.body, message: data.message || {} });
  const textHash = safeHash(normalizedText || '');
  const seed = `${direction}|${senderJid}|${tsClientMs || 'unknown'}|${messageType}|${textHash}`;
  return sha1(seed);
};

const getCompletenessScore = (data) => {
  const fields = [
    data.waMessageId,
    data.clientMessageId,
    data.status,
    data.tsClientMs,
    data.tsClientAt,
    data.body,
    data.messageType,
    data.stableKeyHash,
    data.fingerprintHash,
  ];
  return fields.filter((value) => Boolean(value)).length;
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
  const threadIdHash = shortHash(opts.threadId);

  const snapshot = await db
    .collection('threads')
    .doc(opts.threadId)
    .collection('messages')
    .orderBy('tsClient', 'desc')
    .limit(opts.limit)
    .get();

  const groups = new Map();
  const entries = [];
  let scannedMessages = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const tsClientMs = pickTimestampMs(data);
    if (tsClientMs && tsClientMs < cutoffMs) {
      continue;
    }

    scannedMessages += 1;

    const dedupeKey =
      data.stableKeyHash ||
      data.fingerprintHash ||
      buildFallbackFingerprint({ data, tsClientMs });

    const entry = {
      doc,
      data,
      tsClientMs,
      dedupeKey,
      ingestedAtMs: normalizeTs(data.ingestedAt) || null,
      isDuplicate: data.isDuplicate === true,
    };

    entries.push(entry);
    const bucket = groups.get(dedupeKey) || [];
    bucket.push(entry);
    groups.set(dedupeKey, bucket);
  }

  let groupsWithDuplicates = 0;
  let duplicatesToMark = 0;
  let duplicatesAlreadyMarked = 0;
  const sampleGroups = [];
  const toMark = [];
  const duplicateIds = new Set();

  for (const [key, bucket] of groups.entries()) {
    if (bucket.length <= 1) continue;
    groupsWithDuplicates += 1;

    const sorted = [...bucket].sort((a, b) => {
      if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? 1 : -1;
      const aTime = a.ingestedAtMs ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.ingestedAtMs ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      const aScore = getCompletenessScore(a.data);
      const bScore = getCompletenessScore(b.data);
      if (aScore !== bScore) return bScore - aScore;
      return a.doc.id.localeCompare(b.doc.id);
    });

    const canonical = sorted[0];
    for (const entry of sorted.slice(1)) {
      if (entry.isDuplicate) {
        duplicatesAlreadyMarked += 1;
        continue;
      }
      duplicatesToMark += 1;
      duplicateIds.add(entry.doc.id);
      toMark.push({ ref: entry.doc.ref, duplicateOf: canonical.doc.id });
    }

    if (sampleGroups.length < 5) {
      sampleGroups.push({
        keyHash: shortHash(key),
        size: bucket.length,
        canonicalHash: shortHash(canonical.doc.id),
        duplicateHashes: bucket
          .filter((entry) => entry.doc.id !== canonical.doc.id)
          .slice(0, 5)
          .map((entry) => shortHash(entry.doc.id)),
      });
    }
  }

  let lastMessageAtMsCandidate = null;
  for (const entry of entries) {
    if (entry.isDuplicate) continue;
    if (duplicateIds.has(entry.doc.id)) continue;
    if (!entry.tsClientMs) continue;
    lastMessageAtMsCandidate = Math.max(lastMessageAtMsCandidate || 0, entry.tsClientMs);
  }

  if (opts.apply && toMark.length > 0) {
    const writer = db.bulkWriter();
    writer.onWriteError((err) => {
      if (err.failedAttempts < 3) return true;
      console.error(
        JSON.stringify({
          error: 'WRITE_FAILED',
          docHash: shortHash(err.documentRef.id),
        })
      );
      return false;
    });

    for (const entry of toMark) {
      writer.update(entry.ref, {
        isDuplicate: true,
        duplicateOf: entry.duplicateOf,
        duplicateMarkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await writer.close();
  }

  let threadsUpdated = 0;
  if (opts.apply && lastMessageAtMsCandidate) {
    await db.collection('threads').doc(opts.threadId).update({
      lastMessageAt: admin.firestore.Timestamp.fromMillis(lastMessageAtMsCandidate),
      lastMessageAtMs: lastMessageAtMsCandidate,
    });
    threadsUpdated = 1;
  }

  console.log(
    JSON.stringify({
      threadIdHash,
      scannedMessages,
      groupsWithDuplicates,
      duplicatesToMark,
      duplicatesAlreadyMarked,
      lastMessageAtMsCandidate,
      threadsUpdated,
      sampleGroups,
      windowHours: opts.windowHours,
      limit: opts.limit,
      dryRun: !opts.apply,
    })
  );

  process.exit(duplicatesToMark === 0 ? 0 : 2);
})();
