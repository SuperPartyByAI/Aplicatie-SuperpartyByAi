#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require('firebase-admin');

const toSha1 = (value) =>
  crypto.createHash('sha1').update(String(value)).digest('hex');

const shortHash = (value) => toSha1(value).slice(0, 8);

const parseArgs = (argv) => {
  const opts = {
    limit: 2000,
    accountId: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.limit = val;
      continue;
    }
    if (arg.startsWith('--accountId=')) {
      opts.accountId = arg.split('=')[1] || '';
      continue;
    }
  }

  return opts;
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

const buildConversationKey = (data, docId) => {
  const canonicalThreadId = (data.canonicalThreadId || '').trim();
  if (canonicalThreadId) return canonicalThreadId;

  const isGroup = data.isGroup === true || data.peerType === 'group';
  if (isGroup) {
    return (
      (data.groupJid || '').trim() ||
      (data.clientJid || '').trim() ||
      (data.rawJid || '').trim() ||
      (data.canonicalJid || '').trim() ||
      (data.resolvedJid || '').trim() ||
      docId
    );
  }

  return (
    (data.clientJid || '').trim() ||
    (data.canonicalJid || '').trim() ||
    (data.rawJid || '').trim() ||
    (data.resolvedJid || '').trim() ||
    (data.normalizedPhone || '').trim() ||
    docId
  );
};

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const { db } = initFirestore();
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

  let query = db.collection('threads').orderBy('lastMessageAt', 'desc').limit(opts.limit);
  if (opts.accountId) {
    query = query.where('accountId', '==', opts.accountId.trim());
  }

  const snapshot = await query.get();
  const groups = new Map();

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const key = buildConversationKey(data, doc.id);
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const counts = Array.from(groups.values());
  const duplicateThreadsCount = counts.reduce(
    (sum, count) => sum + (count > 1 ? count - 1 : 0),
    0
  );
  const groupsWithDuplicates = counts.filter((count) => count > 1).length;

  const topDuplicates = Array.from(groups.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({
      conversationKeyHash: shortHash(key),
      threadCount: count,
    }));

  console.log(
    JSON.stringify({
      totalThreadsScanned: snapshot.size,
      uniqueConversationKeys: groups.size,
      duplicateThreadsCount,
      groupsWithDuplicates,
      topDuplicates,
    })
  );

  process.exit(duplicateThreadsCount === 0 ? 0 : 2);
})();
