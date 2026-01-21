#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
    accountId: '',
    printIndexLink: true,
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
    if (arg.startsWith('--accountId=')) {
      opts.accountId = arg.split('=')[1] || '';
    }
    if (arg === '--printIndexLink') {
      opts.printIndexLink = true;
    }
    if (arg === '--no-printIndexLink') {
      opts.printIndexLink = false;
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

const getFirestoreEnvMeta = () => {
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  const hasGac = gacPath.length > 0;
  const gacFileExists = hasGac ? fs.existsSync(gacPath) : false;
  const adcPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  const hasAdc = fs.existsSync(adcPath);
  const projectIdPresent = Boolean(
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID
  );

  return {
    has_GAC: hasGac,
    gac_path_len: gacPath.length,
    gac_file_exists: gacFileExists,
    has_ADC: hasAdc,
    projectId_present: projectIdPresent,
  };
};

const initFirestore = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  try {
    if (!admin.apps.length) {
      if (raw) {
        const serviceAccount = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else {
        admin.initializeApp();
      }
    }
    return { db: admin.firestore(), error: null };
  } catch (error) {
    return { db: null, error: 'Firestore not available' };
  }
};

const getIndexLink = (error) => {
  const raw = error?.message || '';
  const match = raw.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
};

(async () => {
  const opts = parseArgs(process.argv.slice(2));

  const { db, error } = initFirestore();
  if (!db) {
    console.log(
      JSON.stringify(
        {
          error: 'firestore_unavailable',
          message: 'Set GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC',
          env: getFirestoreEnvMeta(),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const nowMs = Date.now();
  const cutoffMs = nowMs - opts.windowHours * 60 * 60 * 1000;

  let query = null;
  if (opts.threadId) {
    query = db
      .collection('threads')
      .doc(opts.threadId)
      .collection('messages')
      .orderBy('tsClient', 'desc')
      .limit(opts.limit);
  } else {
    query = db.collectionGroup('messages').orderBy('tsClient', 'desc').limit(opts.limit);
  }

  if (opts.accountId && !opts.threadId) {
    query = query.where('accountId', '==', opts.accountId.trim());
  }

  let snapshot = null;
  try {
    snapshot = await query.get();
  } catch (error) {
    const indexLink = getIndexLink(error);
    if (indexLink && opts.printIndexLink) {
      console.log(
        JSON.stringify({
          error: 'firestore_index_required',
          message: 'Index required for messages collectionGroup orderBy tsClient',
          indexLink,
        })
      );
      process.exit(2);
    }
    console.log(
      JSON.stringify({
        error: 'firestore_query_failed',
        message: 'Firestore query failed',
      })
    );
    process.exit(2);
  }

  const activeGroups = new Map();
  const allGroups = new Map();
  const keyStrategyUsedCounts = {
    stableKeyHash: 0,
    fingerprintHash: 0,
    fallback: 0,
  };
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

    let key = null;
    if (opts.keyMode === 'fallback') {
      key = buildLegacyFingerprint({ data, tsClientMs });
      keyStrategyUsedCounts.fallback += 1;
    } else if (data.stableKeyHash) {
      key = data.stableKeyHash;
      keyStrategyUsedCounts.stableKeyHash += 1;
    } else if (data.fingerprintHash) {
      key = data.fingerprintHash;
      keyStrategyUsedCounts.fingerprintHash += 1;
    } else {
      key = buildStableFallbackFingerprint({ data, tsClientMs });
      keyStrategyUsedCounts.fallback += 1;
    }

    if (!(data.isDuplicate === true && opts.excludeMarked)) {
      activeGroups.set(key, (activeGroups.get(key) || 0) + 1);
    }
    allGroups.set(key, (allGroups.get(key) || 0) + 1);
  }

  const activeEntries = Array.from(activeGroups.values());
  const allEntries = Array.from(allGroups.values());
  const duplicatesCountActive = activeEntries.reduce(
    (sum, count) => sum + (count > 1 ? count - 1 : 0),
    0
  );
  const duplicatesCountAll = allEntries.reduce(
    (sum, count) => sum + (count > 1 ? count - 1 : 0),
    0
  );

  console.log(
    JSON.stringify({
      totalDocs,
      markedDocs,
      activeDocs: totalDocs - markedDocs,
      uniqueKeys: opts.includeMarked ? allEntries.length : activeEntries.length,
      duplicatesCountActive,
      duplicatesCountAll: opts.includeMarked ? duplicatesCountAll : null,
      keyStrategyUsedCounts,
      windowHours: opts.windowHours,
      limit: opts.limit,
      keyMode: opts.keyMode,
      excludeMarked: opts.excludeMarked,
      dryRun: opts.dryRun,
    })
  );

  process.exit(duplicatesCountActive === 0 ? 0 : 2);
})();
