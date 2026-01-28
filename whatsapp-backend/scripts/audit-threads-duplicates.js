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
    limit: 500,
    windowHours: 48,
    accountId: '',
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
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

const normalizeJid = (jid) => {
  if (!jid) return '';
  const trimmed = String(jid).trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length < 2) return trimmed.replace(/^\+/, '');
  const userPart = parts[0].replace(/^\+/, '').split(':')[0];
  const domain = parts.slice(1).join('@');
  return `${userPart}@${domain}`;
};

const pickJid = (data, docId) =>
  data.canonicalJid ||
  data.clientJid ||
  data.rawJid ||
  data.resolvedJid ||
  data.jid ||
  data.threadJid ||
  data.groupJid ||
  docId;

const buildConversationKey = (data, docId) => {
  const canonicalThreadId = (data.canonicalThreadId || '').trim();
  if (canonicalThreadId) return canonicalThreadId;

  const jid = pickJid(data, docId);
  return normalizeJid(jid || docId);
};

const isLidThread = (data) => {
  const jid = pickJid(data, '');
  return typeof jid === 'string' && jid.toLowerCase().endsWith('@lid');
};

const fetchThreadsFromBackend = async ({ accountId, limit }) => {
  const baseUrl =
    process.env.WHATSAPP_BACKEND_URL ||
    process.env.BACKEND_URL ||
    'http://127.0.0.1:8080';
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (!adminToken) {
    return { threads: null, error: 'admin_token_missing' };
  }
  if (!accountId) {
    return { threads: null, error: 'account_id_required' };
  }

  const url = new URL(
    `/api/whatsapp/threads/${encodeURIComponent(accountId)}`,
    baseUrl
  );
  url.searchParams.set('limit', String(limit));
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    if (!response.ok) {
      return { threads: null, error: `http_${response.status}` };
    }
    const body = await response.json();
    return { threads: body?.threads || [], error: null };
  } catch (error) {
    return { threads: null, error: 'fetch_failed' };
  }
};

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/audit-threads-duplicates.js [--windowHours=48] [--limit=500] [--accountId=...]`);
    process.exit(0);
  }
  const { db } = initFirestore();
  let threads = [];
  if (!db) {
    const fallback = await fetchThreadsFromBackend({
      accountId: opts.accountId,
      limit: opts.limit,
    });
    if (!fallback.threads) {
      console.log(
        JSON.stringify(
          {
            error: 'firestore_unavailable',
            message: 'Set GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC',
            env: getFirestoreEnvMeta(),
            fallbackError: fallback.error,
          },
          null,
          2
        )
      );
      process.exit(1);
    }
    threads = fallback.threads;
  } else {
    let query = db.collection('threads').orderBy('lastMessageAt', 'desc').limit(opts.limit);
    if (opts.accountId) {
      query = query.where('accountId', '==', opts.accountId.trim());
    }
    const snapshot = await query.get();
    threads = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  const cutoffMs = Date.now() - opts.windowHours * 60 * 60 * 1000;
  const groups = new Map();
  let totalThreads = 0;
  let lidThreadsCount = 0;
  let canonicalThreadsCount = 0;
  let unknownNameCount = 0;

  for (const item of threads) {
    const data = item || {};
    const docId = data.id || '';
    const lastMessageAtMs = normalizeTs(data.lastMessageAt);
    if (lastMessageAtMs && lastMessageAtMs < cutoffMs) {
      continue;
    }
    totalThreads += 1;
    if (isLidThread(data)) lidThreadsCount += 1;
    if ((data.canonicalThreadId || '').trim().length > 0) {
      canonicalThreadsCount += 1;
    }
    const displayName = (data.displayName || '').toString().trim();
    if (!displayName) {
      unknownNameCount += 1;
    }
    const key = buildConversationKey(data, docId);
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const counts = Array.from(groups.values());
  const duplicatesCount = counts.reduce(
    (sum, count) => sum + (count > 1 ? count - 1 : 0),
    0
  );
  const topDuplicateGroups = Array.from(groups.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({
      keyHash: shortHash(key),
      count,
    }));

  console.log(
    JSON.stringify({
      totalThreads,
      uniqueKeys: groups.size,
      duplicatesCount,
      topDuplicateGroups,
      lidThreadsCount,
      canonicalThreadsCount,
      unknownNameCount,
    })
  );

  process.exit(duplicatesCount === 0 ? 0 : 2);
})();
