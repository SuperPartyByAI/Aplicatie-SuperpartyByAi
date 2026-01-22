#!/usr/bin/env node

const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require('firebase-admin');
const { normalizeMessageText, safeHash } = require('../lib/wa-message-identity');

const toSha1 = (value) =>
  crypto.createHash('sha1').update(String(value)).digest('hex');

const shortHash = (value) => toSha1(value).slice(0, 8);

const debugLog = (payload) => {
  try {
    if (typeof fetch === 'function') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
      // #endregion
      return;
    }
  } catch (_) {}

  try {
    const data = Buffer.from(JSON.stringify(payload));
    const req = http.request(
      'http://127.0.0.1:7242/ingest/151b7789-5ef8-402d-b94f-ab69f556b591',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }
    );
    req.on('error', () => {});
    req.write(data);
    req.end();
  } catch (_) {
    // ignore
  }
};

const coerceToMs = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) return num < 1e12 ? num * 1000 : num;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    const nanos = value.nanoseconds ?? value._nanoseconds;
    if (Number.isFinite(seconds)) {
      const ms = seconds * 1000 + (Number.isFinite(nanos) ? Math.floor(nanos / 1e6) : 0);
      return ms;
    }
    if (value.timestampValue) return coerceToMs(value.timestampValue);
    if (value.integerValue) return coerceToMs(Number(value.integerValue));
    if (value.doubleValue) return coerceToMs(Number(value.doubleValue));
    if (value.stringValue) return coerceToMs(String(value.stringValue));
  }
  return null;
};

const ageBucketFromMs = (ageMs) => {
  if (!Number.isFinite(ageMs)) return 'unknown';
  if (ageMs < 15 * 60 * 1000) return 'lt15m';
  if (ageMs < 6 * 60 * 60 * 1000) return 'lt6h';
  if (ageMs < 48 * 60 * 60 * 1000) return 'lt48h';
  return 'ge48h';
};

const detectTsClientType = (value) => {
  if (value === null || value === undefined) return 'missing';
  if (typeof value?.toMillis === 'function') return 'timestamp';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const getPathValue = (root, path) => {
  if (!root) return undefined;
  const parts = path.split('.');
  let node = root;
  for (const part of parts) {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) {
      const idx = Number(part);
      if (!Number.isFinite(idx)) return undefined;
      node = node[idx];
      continue;
    }
    node = node[part];
  }
  return node;
};

const extractFirstValue = (data, paths) => {
  for (const path of paths) {
    const value = getPathValue(data, path);
    if (value !== undefined && value !== null && String(value).length > 0) {
      return { value, path };
    }
  }
  return { value: null, path: null };
};

const providerIdPaths = [
  'providerMessageId',
  'providerMsgId',
  'messageId',
  'waMessageId',
  'id',
  'raw.key.id',
  'raw.message.key.id',
  'raw.messages.0.key.id',
  'payload.messages.0.id',
  'payload.entry.0.changes.0.value.messages.0.id',
  'message.key.id',
  'key.id',
];

const threadIdPaths = [
  'threadId',
  'canonicalThreadId',
  'chatId',
  'jid',
  'remoteJid',
  'raw.key.remoteJid',
  'message.key.remoteJid',
  'key.remoteJid',
];

const fromPaths = [
  'from',
  'sender',
  'participant',
  'senderJid',
  'raw.key.participant',
  'message.key.participant',
  'key.participant',
];

const contentPaths = ['body', 'text', 'message.text', 'message.conversation'];

const extractProviderMessageId = (data) => extractFirstValue(data, providerIdPaths);
const extractThreadId = (data) => extractFirstValue(data, threadIdPaths);
const extractFrom = (data) => extractFirstValue(data, fromPaths);
const extractContent = (data) => extractFirstValue(data, contentPaths);

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
    debug: 0,
    keyHash: '',
    schema: false,
    schemaSamples: 1,
    schemaKeyHash: '',
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
    if (arg.startsWith('--debug=')) {
      const val = arg.split('=')[1];
      if (val === 'true') {
        opts.debug = 1;
      } else if (val === 'false') {
        opts.debug = 0;
      } else {
        const num = Number(val);
        opts.debug = Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
      }
    }
    if (arg.startsWith('--keyHash=')) {
      opts.keyHash = (arg.split('=')[1] || '').trim();
    }
    if (arg.startsWith('--schema=')) {
      const val = arg.split('=')[1];
      opts.schema = val === '1' || val === 'true';
    }
    if (arg.startsWith('--schemaSamples=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.schemaSamples = Math.min(10, Math.floor(val));
    }
    if (arg.startsWith('--schemaKeyHash=')) {
      opts.schemaKeyHash = (arg.split('=')[1] || '').trim();
    }
  }

  return opts;
};

const pickTimestampMs = (data) =>
  coerceToMs(data.tsClientMs) ||
  coerceToMs(data.tsClientAt) ||
  coerceToMs(data.tsClient) ||
  coerceToMs(data.tsServer) ||
  coerceToMs(data.ingestedAt) ||
  coerceToMs(data.createdAt) ||
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

const buildStableKeyHash = ({ data, accountId, tsClientMs }) => {
  const { value: providerMessageId } = extractProviderMessageId(data);
  if (providerMessageId) {
    return toSha1(`${accountId || 'unknown'}|${providerMessageId}`);
  }

  const { value: threadId } = extractThreadId(data);
  const { value: from } = extractFrom(data);
  const { value: content } = extractContent(data);
  const minuteBucket = tsClientMs ? Math.floor(tsClientMs / 60000) * 60000 : 'unknown';
  const contentHash = safeHash(content || '');
  const seed = `${accountId || 'unknown'}|${threadId || 'unknown'}|${from || 'unknown'}|${minuteBucket}|${contentHash}`;
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
  if (!match) return null;
  const url = match[0];
  if (url.includes('console.firebase.google.com') || url.includes('firebase.google.com')) {
    return url;
  }
  return null;
};

const getProjectId = () =>
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || null;

const getHint = (error, message) => {
  const code = error?.code || '';
  const msg = message.toLowerCase();
  if (code === 9 || msg.includes('requires an index') || msg.includes('index')) {
    return 'missing_index';
  }
  if (code === 'unauthenticated' || msg.includes('default credentials')) {
    return 'missing_credentials';
  }
  if (code === 'permission-denied' || msg.includes('permission_denied')) {
    return 'permission_denied';
  }
  if (code === 'unavailable' || msg.includes('unavailable') || msg.includes('timeout')) {
    return 'unavailable';
  }
  return 'unknown';
};

const hashStack = (stack) => {
  if (!stack) return null;
  return crypto.createHash('sha1').update(String(stack)).digest('hex').slice(0, 8);
};

const bumpCount = (map, key, delta = 1) => {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + delta);
};

const topEntries = (map, limit = 10) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

const collectWindowDocs = async ({
  threadsQuery,
  threadId,
  limit,
  cutoffMs,
  nowMs,
  perThreadLimit = 50,
}) => {
  const collected = [];
  let parseFailures = 0;
  let parsedMinMs = null;
  let parsedMaxMs = null;
  let lastThreadDoc = null;
  let pages = 0;
  let threadsScanned = 0;
  let messagesScanned = 0;
  const maxPages = 10;
  const pageSize = 50;

  const processThread = async (threadDoc) => {
    if (!threadDoc?.ref) return;
    threadsScanned += 1;
    const remaining = limit - collected.length;
    if (remaining <= 0) return;
    const threadLimit = Math.min(perThreadLimit, remaining);
    const messagesSnapshot = await threadDoc.ref
      .collection('messages')
      .orderBy('tsServer', 'desc')
      .limit(threadLimit)
      .get();

    for (const doc of messagesSnapshot.docs) {
      messagesScanned += 1;
      const data = doc.data() || {};
      const tsClientMs = pickTimestampMs(data);
      if (!tsClientMs) {
        parseFailures += 1;
        continue;
      }
      parsedMinMs = parsedMinMs === null ? tsClientMs : Math.min(parsedMinMs, tsClientMs);
      parsedMaxMs = parsedMaxMs === null ? tsClientMs : Math.max(parsedMaxMs, tsClientMs);
      if (tsClientMs >= cutoffMs) {
        collected.push(doc);
        if (collected.length >= limit) break;
      }
    }
  };

  if (threadId) {
    const threadDoc = await threadsQuery.doc(threadId).get();
    if (threadDoc.exists) {
      await processThread(threadDoc);
    }
  } else {
    while (collected.length < limit && pages < maxPages) {
      let pageQuery = threadsQuery.limit(pageSize);
      if (lastThreadDoc) pageQuery = pageQuery.startAfter(lastThreadDoc);
      const pageSnapshot = await pageQuery.get();
      if (pageSnapshot.empty) break;
      pages += 1;
      for (const threadDoc of pageSnapshot.docs) {
        await processThread(threadDoc);
        if (collected.length >= limit) break;
      }
      lastThreadDoc = pageSnapshot.docs[pageSnapshot.docs.length - 1];
    }
  }

  return {
    docs: collected,
    parseFailures,
    parsedMinMs,
    parsedMaxMs,
    windowModeUsed: 'clientSideWindow',
    threadsScanned,
    messagesScanned,
  };
};

const isMissingIndex = (error, message, indexLink) => {
  const code = error?.code;
  const msg = message.toLowerCase();
  if (indexLink) return true;
  if (code === 3 || code === 9) {
    return msg.includes('requires') && msg.includes('index');
  }
  return msg.includes('requires') && msg.includes('index');
};

module.exports = {
  coerceToMs,
  getPathValue,
  extractFirstValue,
  extractProviderMessageId,
  extractThreadId,
  extractFrom,
  extractContent,
  buildStableKeyHash,
};

if (require.main === module) {
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

  // #region agent log
  debugLog({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'audit-firestore-duplicates.js:455',message:'audit_start',data:{windowHours:opts.windowHours,limit:opts.limit,threadId:Boolean(opts.threadId),accountId:Boolean(opts.accountId),projectIdPresent:Boolean(getProjectId())},timestamp:Date.now()});
  // #endregion

  let query = null;
  let queryShape = 'threads/*/messages|orderBy:tsServer desc';
  const nowMs = Date.now();
  const cutoffMs = nowMs - opts.windowHours * 60 * 60 * 1000;
  if (opts.threadId) {
    query = db.collection('threads');
    queryShape = 'threads/{threadId}/messages|orderBy:tsServer desc';
  } else {
    query = db.collection('threads');
  }

  if (opts.accountId && !opts.threadId) {
    query = query.where('accountId', '==', opts.accountId.trim());
    queryShape += '|where:accountId==';
  }

  let snapshot = null;
  let modeUsed = 'desc';
  let usedFallback = false;
  let fallbackIndexLink = null;
  let windowModeUsed = 'firestoreWhere';
  let parseFailures = 0;
  let parsedMinMs = null;
  let parsedMaxMs = null;
  const pageSize = Math.min(500, opts.limit);
  try {
    const windowResult = await collectWindowDocs({
      threadsQuery: query,
      threadId: opts.threadId,
      cutoffMs,
      limit: opts.limit,
      nowMs,
    });
    snapshot = { docs: windowResult.docs };
    parseFailures = windowResult.parseFailures;
    parsedMinMs = windowResult.parsedMinMs;
    parsedMaxMs = windowResult.parsedMaxMs;
    windowModeUsed = windowResult.windowModeUsed;
    snapshot.threadsScanned = windowResult.threadsScanned;
    snapshot.messagesScanned = windowResult.messagesScanned;
  } catch (error) {
    const message = error?.message || 'Firestore query failed';
    const indexLink = getIndexLink(error);
    const hint = getHint(error, message);
    const missingIndex = isMissingIndex(error, message, indexLink);

    if (missingIndex) {
      usedFallback = true;
      modeUsed = 'desc_fallback';
      fallbackIndexLink = indexLink;
      const windowResult = await collectWindowDocs({
        threadsQuery: query,
        threadId: opts.threadId,
        cutoffMs,
        limit: opts.limit,
        nowMs,
      });
      snapshot = { docs: windowResult.docs };
      parseFailures = windowResult.parseFailures;
      parsedMinMs = windowResult.parsedMinMs;
      parsedMaxMs = windowResult.parsedMaxMs;
      windowModeUsed = windowResult.windowModeUsed;
      snapshot.threadsScanned = windowResult.threadsScanned;
      snapshot.messagesScanned = windowResult.messagesScanned;
      queryShape += '|clientSideWindow';
    } else {
      const payload = {
        error: 'firestore_query_failed',
        code: error?.code || null,
        message,
        hint,
        indexLink: indexLink && opts.printIndexLink ? indexLink : null,
        projectId: getProjectId(),
        emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || null,
        usedFallback,
        modeUsed,
      };

      if (opts.debug) {
        payload.rawErrorName = error?.name || null;
        payload.rawErrorStackSha8 = hashStack(error?.stack);
        payload.queryShape = queryShape;
      }

      console.log(JSON.stringify(payload));
      process.exit(2);
    }
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
  let scannedMinMs = parsedMinMs;
  let scannedMaxMs = parsedMaxMs;
  const drilldownEnabled = Boolean(opts.keyHash);
  const schemaProbeEnabled = Boolean(opts.schema);
  const schemaProbe = {
    schemaKeyHash: opts.schemaKeyHash || null,
    samples: [],
  };
  const drilldown = {
    directionCounts: new Map(),
    messageTypeCounts: new Map(),
    statusCounts: new Map(),
    collectionCounts: new Map(),
    sourceCounts: new Map(),
    minuteBuckets: new Map(),
    accountIdHashes: new Map(),
    providerMessageIdHashes: new Map(),
    requestIdHashes: new Map(),
    threadIdHashes: new Map(),
    hasFieldCounts: new Map(),
    missingFieldCounts: new Map(),
    minTsMs: null,
    maxTsMs: null,
  };

  // #region agent log
  debugLog({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4',location:'audit-firestore-duplicates.js:671',message:'audit_snapshot',data:{docsCount:snapshot?.docs?.length||0,windowModeUsed,usedFallback,modeUsed,parseFailures,cutoffMs,nowMs,parsedMinMs,parsedMaxMs,queryShape},timestamp:Date.now()});
  // #endregion

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const tsClientMs = pickTimestampMs(data);

    if (tsClientMs) {
      scannedMinMs = scannedMinMs === null ? tsClientMs : Math.min(scannedMinMs, tsClientMs);
      scannedMaxMs = scannedMaxMs === null ? tsClientMs : Math.max(scannedMaxMs, tsClientMs);
    }

    if (tsClientMs && tsClientMs < cutoffMs) {
      continue;
    }

    totalDocs += 1;
    if (data.isDuplicate === true) {
      markedDocs += 1;
    }

    const accountId =
      data.accountId || data.accountID || data.account_id || data.account || data.account_id_hash || '';
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
      key = buildStableKeyHash({ data, accountId, tsClientMs });
      keyStrategyUsedCounts.stableKeyHash += 1;
    }

    if (!(data.isDuplicate === true && opts.excludeMarked)) {
      activeGroups.set(key, (activeGroups.get(key) || 0) + 1);
    }
    allGroups.set(key, (allGroups.get(key) || 0) + 1);

    const matchesDrilldown = drilldownEnabled && shortHash(key) === opts.keyHash;
    if (matchesDrilldown) {
      const direction = getDirection(data);
      const messageType = data.messageType || data.type || 'unknown';
      const status = data.status || data.sendStatus || data.queueStatus || data.deliveryStatus || 'unknown';
      const source =
        data.source || data.origin || data.writer || data.ingestSource || data.sendSource || 'unknown';
      const path = doc.ref?.path || '';
      let collectionHint = 'other';
      if (path.includes('/outbox/')) collectionHint = 'outbox';
      else if (path.includes('/messages/')) collectionHint = 'messages';

      bumpCount(drilldown.directionCounts, String(direction));
      bumpCount(drilldown.messageTypeCounts, String(messageType));
      bumpCount(drilldown.statusCounts, String(status));
      bumpCount(drilldown.collectionCounts, collectionHint);
      bumpCount(drilldown.sourceCounts, shortHash(String(source)));

      const minuteBucket = tsClientMs ? Math.floor(tsClientMs / 60000) * 60000 : null;
      if (minuteBucket) {
        bumpCount(drilldown.minuteBuckets, String(minuteBucket));
      }
      if (tsClientMs) {
        drilldown.minTsMs = drilldown.minTsMs === null ? tsClientMs : Math.min(drilldown.minTsMs, tsClientMs);
        drilldown.maxTsMs = drilldown.maxTsMs === null ? tsClientMs : Math.max(drilldown.maxTsMs, tsClientMs);
      }

      const { value: providerMessageId } = extractProviderMessageId(data);
      const { value: threadId } = extractThreadId(data);
      const { value: requestId } = extractFirstValue(data, ['requestId', 'clientRequestId', 'sendRequestId']);
      if (accountId) bumpCount(drilldown.accountIdHashes, shortHash(String(accountId)));
      if (providerMessageId) bumpCount(drilldown.providerMessageIdHashes, shortHash(String(providerMessageId)));
      if (requestId) bumpCount(drilldown.requestIdHashes, shortHash(String(requestId)));
      if (threadId) bumpCount(drilldown.threadIdHashes, shortHash(String(threadId)));

      if (opts.debug >= 2) {
        const hasField = (field, present) => {
          bumpCount(present ? drilldown.hasFieldCounts : drilldown.missingFieldCounts, field);
        };
        const hasVal = (val) => val !== undefined && val !== null && String(val).length > 0;
        hasField('tsClient', hasVal(data.tsClient));
        hasField('tsClientMs', hasVal(data.tsClientMs));
        hasField('tsClientAt', hasVal(data.tsClientAt));
        hasField('ingestedAt', hasVal(data.ingestedAt));
        hasField('createdAt', hasVal(data.createdAt));
        hasField('updatedAt', hasVal(data.updatedAt));
        hasField('messageId', hasVal(getPathValue(data, 'messageId') || getPathValue(data, 'id')));
        hasField('providerMessageId', hasVal(extractProviderMessageId(data).value));
        hasField('requestId', hasVal(extractFirstValue(data, ['requestId', 'clientRequestId', 'sendRequestId']).value));
        hasField('threadId', hasVal(extractThreadId(data).value));
        hasField('from', hasVal(extractFrom(data).value));
        hasField('to', hasVal(getPathValue(data, 'to')));
        hasField('type', hasVal(getPathValue(data, 'messageType') || getPathValue(data, 'type')));
      }
    }

    if (schemaProbeEnabled && schemaProbe.samples.length < opts.schemaSamples) {
      if (!opts.schemaKeyHash || shortHash(key) === opts.schemaKeyHash) {
        const topLevelKeys = Object.keys(data || {}).sort();
        const candidatePaths = [
          'tsClient',
          'tsClientMs',
          'tsClientAt',
          'ingestedAt',
          'createdAt',
          'updatedAt',
          'messageId',
          'providerMessageId',
          'providerMsgId',
          'requestId',
          'threadId',
          'canonicalThreadId',
          'jid',
          'remoteJid',
          'from',
          'to',
          'messageType',
          'type',
          ...providerIdPaths,
          ...threadIdPaths,
          ...fromPaths,
          ...contentPaths,
        ];
        const uniquePaths = Array.from(new Set(candidatePaths));
        const pathsPresent = {};
        const typesByPath = {};
        for (const path of uniquePaths) {
          const value = getPathValue(data, path);
          if (value !== undefined) {
            pathsPresent[path] = true;
            let type = typeof value;
            if (value === null) type = 'null';
            if (Array.isArray(value)) type = 'array';
            if (type === 'object') {
              if (typeof value?.toMillis === 'function' || value?.seconds || value?._seconds) {
                type = 'timestamp';
              }
            }
            typesByPath[path] = type;
          }
        }
        schemaProbe.samples.push({ topLevelKeys, pathsPresent, typesByPath });
      }
    }
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
  const duplicateGroupsCount = Array.from(activeGroups.values()).filter((count) => count > 1).length;
  const topDuplicateGroups = Array.from(activeGroups.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({ keyHash: shortHash(key), count }));

  const payload = {
    totalDocs,
    markedDocs,
    activeDocs: totalDocs - markedDocs,
    uniqueKeys: opts.includeMarked ? allEntries.length : activeEntries.length,
    duplicatesCountActive,
    duplicatesCountAll: opts.includeMarked ? duplicatesCountAll : null,
    keyStrategyUsedCounts,
    windowModeUsed,
    parseFailures,
    newestDocAgeSeconds: scannedMaxMs ? Math.max(0, Math.floor((nowMs - scannedMaxMs) / 1000)) : null,
    oldestDocAgeSeconds: scannedMinMs ? Math.max(0, Math.floor((nowMs - scannedMinMs) / 1000)) : null,
    earliestAgeBucket: scannedMinMs ? ageBucketFromMs(nowMs - scannedMinMs) : 'unknown',
    latestAgeBucket: scannedMaxMs ? ageBucketFromMs(nowMs - scannedMaxMs) : 'unknown',
    windowHours: opts.windowHours,
    limit: opts.limit,
    keyMode: opts.keyMode,
    excludeMarked: opts.excludeMarked,
    dryRun: opts.dryRun,
    usedFallback,
    modeUsed,
    hint: null,
    indexLink: usedFallback ? fallbackIndexLink : null,
    collection: 'threads/*/messages',
    threadsScanned: snapshot?.threadsScanned ?? null,
    messagesScanned: snapshot?.messagesScanned ?? null,
  };

  if (opts.debug) {
    payload.duplicateGroupsCount = duplicateGroupsCount;
    payload.topDuplicateGroups = topDuplicateGroups;
    if (drilldownEnabled) {
      payload.drilldown = {
        keyHash: opts.keyHash,
        directionCounts: topEntries(drilldown.directionCounts, 10),
        messageTypeCounts: topEntries(drilldown.messageTypeCounts, 10),
        statusCounts: topEntries(drilldown.statusCounts, 10),
        collectionCounts: topEntries(drilldown.collectionCounts, 10),
        sourceCounts: topEntries(drilldown.sourceCounts, 10),
        minuteBuckets: topEntries(drilldown.minuteBuckets, 15),
        accountIdHashes: topEntries(drilldown.accountIdHashes, 10),
        providerMessageIdHashes: topEntries(drilldown.providerMessageIdHashes, 10),
        requestIdHashes: topEntries(drilldown.requestIdHashes, 10),
        threadIdHashes: topEntries(drilldown.threadIdHashes, 10),
      };
      if (opts.debug >= 2) {
        payload.drilldown.minTsMs = drilldown.minTsMs;
        payload.drilldown.maxTsMs = drilldown.maxTsMs;
        payload.drilldown.hasFieldCounts = topEntries(drilldown.hasFieldCounts, 50);
        payload.drilldown.missingFieldCounts = topEntries(drilldown.missingFieldCounts, 50);
      }
    }
  }

  if (schemaProbeEnabled) {
    payload.schemaProbe = schemaProbe;
  }

  console.log(JSON.stringify(payload));

    process.exit(duplicatesCountActive === 0 ? 0 : 2);
  })();
}
