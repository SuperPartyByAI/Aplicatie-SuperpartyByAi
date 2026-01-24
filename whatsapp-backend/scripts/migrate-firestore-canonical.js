#!/usr/bin/env node

const admin = require('firebase-admin');
const crypto = require('crypto');
const {
  canonicalizeJid,
  buildCanonicalThreadId,
  computeTsClient,
  safeHash,
} = require('../lib/wa-canonical');

const sha1 = (value) => crypto.createHash('sha1').update(String(value)).digest('hex');

const parseArgs = (argv) => {
  const opts = {
    accountId: '',
    days: 30,
    threads: 200,
    apply: false,
    startAfterThreadId: null,
    concurrency: 2,
    pageSize: 300,
  };

  for (const arg of argv) {
    if (arg.startsWith('--accountId=')) {
      opts.accountId = arg.split('=')[1] || '';
      continue;
    }
    if (arg.startsWith('--days=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.days = val;
      continue;
    }
    if (arg.startsWith('--threads=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.threads = val;
      continue;
    }
    if (arg === '--apply') {
      opts.apply = true;
      continue;
    }
    if (arg.startsWith('--startAfterThreadId=')) {
      opts.startAfterThreadId = arg.split('=')[1] || null;
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.concurrency = val;
      continue;
    }
    if (arg.startsWith('--pageSize=')) {
      const val = Number(arg.split('=')[1]);
      if (Number.isFinite(val) && val > 0) opts.pageSize = val;
      continue;
    }
  }

  return opts;
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

const shouldApply = (applyFlag) => applyFlag && process.env.MIGRATE_APPLY === '1';

const normalizeThreadJid = (threadId, data, accountId) => {
  const rawJid =
    data.clientJidRaw ||
    data.rawJid ||
    (threadId.startsWith(`${accountId}__`) ? threadId.replace(`${accountId}__`, '') : null);

  const canonical = canonicalizeJid(rawJid);
  return {
    rawJid,
    canonicalJid: canonical.canonicalJid,
    peerType: canonical.peerType,
    isGroup: canonical.isGroup,
  };
};

const computeFingerprint = (data, tsClientMs) => {
  const direction = data.direction || (data.fromMe ? 'outbound' : 'inbound') || 'unknown';
  const body = (data.body || data.message || '').toString().trim();
  const bodyHash = safeHash(body || '');
  const messageType = data.messageType || data.type || 'unknown';
  const senderJid = data.senderJid || data.participant || '';
  const seed = `${direction}|${tsClientMs || 'unknown'}|${bodyHash}|${messageType}|${senderJid}`;
  return sha1(seed);
};

(async () => {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.accountId) {
    console.error('Missing --accountId');
    process.exit(3);
  }

  const { db, error } = initFirestore();
  if (!db) {
    console.log(error);
    process.exit(3);
  }

  const apply = shouldApply(opts.apply);
  const cutoffMs = Date.now() - opts.days * 24 * 60 * 60 * 1000;

  const summary = {
    scannedThreads: 0,
    mergeCandidates: 0,
    threadsMerged: 0,
    messagesScanned: 0,
    messagesCopied: 0,
    duplicatesSkipped: 0,
    timestampsFixedCount: 0,
    groupNamesFixedCount: 0,
    aliasMarkedCount: 0,
    topMergeCandidates: [],
  };

  let query = db.collection('threads').where('accountId', '==', opts.accountId);
  try {
    query = query.orderBy('lastMessageAt', 'desc');
  } catch (_error) {
    query = query.orderBy('createdAt', 'desc');
  }
  if (opts.startAfterThreadId) {
    const startDoc = await db.collection('threads').doc(opts.startAfterThreadId).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }
  query = query.limit(opts.threads);

  const threadsSnapshot = await query.get();
  const mergeCandidates = [];

  for (const threadDoc of threadsSnapshot.docs) {
    const threadId = threadDoc.id;
    const data = threadDoc.data() || {};

    if (data.isAlias) {
      continue;
    }

    if (data.lastMessageAt?.toMillis) {
      const lastMs = data.lastMessageAt.toMillis();
      if (lastMs < cutoffMs) {
        continue;
      }
    }

    summary.scannedThreads += 1;
    const normalized = normalizeThreadJid(threadId, data, opts.accountId);
    if (!normalized.canonicalJid) {
      continue;
    }

    const targetThreadId = buildCanonicalThreadId(opts.accountId, normalized.canonicalJid);
    if (!targetThreadId) {
      continue;
    }

    if (threadId === targetThreadId) {
      const shouldFixGroupName =
        normalized.isGroup &&
        data.displayName &&
        data.lastMessageSenderName &&
        data.displayName === data.lastMessageSenderName &&
        data.groupSubject;
      if (shouldFixGroupName) {
        summary.groupNamesFixedCount += 1;
        if (apply) {
          await threadDoc.ref.set(
            {
              displayName: data.groupSubject,
            },
            { merge: true }
          );
        }
      }
      continue;
    }

    summary.mergeCandidates += 1;
    mergeCandidates.push({
      from: safeHash(threadId),
      to: safeHash(targetThreadId),
      messageCount: data.messageCount || 0,
    });

    if (!apply) {
      continue;
    }

    const targetRef = db.collection('threads').doc(targetThreadId);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      await targetRef.set(
        {
          accountId: opts.accountId,
          clientJid: normalized.canonicalJid,
          clientJidRaw: normalized.rawJid,
          rawJid: normalized.rawJid,
          canonicalThreadId: targetThreadId,
          peerType: normalized.peerType,
          isGroup: normalized.isGroup,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      const targetData = targetDoc.data() || {};
      const merged = {
        clientJid: targetData.clientJid || normalized.canonicalJid,
        clientJidRaw: targetData.clientJidRaw || normalized.rawJid,
        rawJid: targetData.rawJid || normalized.rawJid,
        peerType: targetData.peerType || normalized.peerType,
        isGroup: targetData.isGroup ?? normalized.isGroup,
      };
      if (!targetData.groupSubject && data.groupSubject) {
        merged.groupSubject = data.groupSubject;
      }
      if (!targetData.displayName && data.displayName) {
        merged.displayName = data.displayName;
      }
      await targetRef.set(merged, { merge: true });
    }

    const sourceMessagesRef = threadDoc.ref.collection('messages');
    let msgQuery = sourceMessagesRef.orderBy('tsClient', 'desc').limit(opts.pageSize);
    let lastMsgDoc = null;
    let keepPaging = true;

    while (keepPaging) {
      const pageQuery = lastMsgDoc ? msgQuery.startAfter(lastMsgDoc) : msgQuery;
      const msgSnapshot = await pageQuery.get();
      if (msgSnapshot.empty) break;

      for (const msgDoc of msgSnapshot.docs) {
        summary.messagesScanned += 1;
        const msgData = msgDoc.data() || {};
        const tsInfo = computeTsClient({
          tsClient: msgData.tsClient,
          tsClientAt: msgData.tsClientAt,
          tsClientMs: msgData.tsClientMs,
          tsClientIso: msgData.tsClientIso,
          messageTimestamp: msgData.messageTimestamp,
        });
        const tsClientMs = tsInfo.tsClientMs;

        const targetMessageRef = targetRef.collection('messages').doc(msgDoc.id);
        const targetMessageSnap = await targetMessageRef.get();
        if (targetMessageSnap.exists) {
          summary.duplicatesSkipped += 1;
          if (apply) {
            await msgDoc.ref.set(
              {
                isDuplicate: true,
                duplicateReason: 'doc_exists_in_target',
                canonicalThreadId: targetThreadId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          continue;
        }

        const fingerprint = computeFingerprint(msgData, tsClientMs);
        const dedupeRef = targetRef.collection('dedupe').doc(fingerprint);
        const dedupeSnap = await dedupeRef.get();
        if (dedupeSnap.exists) {
          summary.duplicatesSkipped += 1;
          if (apply) {
            await msgDoc.ref.set(
              {
                isDuplicate: true,
                duplicateReason: 'fingerprint_match',
                canonicalThreadId: targetThreadId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          continue;
        }

        const updates = {
          accountId: opts.accountId,
          clientJid: normalized.canonicalJid,
          clientJidRaw: normalized.rawJid,
          rawJid: normalized.rawJid,
          canonicalThreadId: targetThreadId,
          peerType: normalized.peerType,
          isGroup: normalized.isGroup,
          tsClient: tsInfo.tsClientAt || admin.firestore.FieldValue.serverTimestamp(),
          tsClientMs,
          tsClientFallback: tsInfo.tsClientFallback,
          tsClientReason: tsInfo.tsClientReason,
          tsClientIso: tsClientMs ? new Date(tsClientMs).toISOString() : null,
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (tsClientMs && (!msgData.tsClientMs || !msgData.tsClientAt)) {
          summary.timestampsFixedCount += 1;
        }

        await targetMessageRef.set(
          {
            ...msgData,
            ...updates,
          },
          { merge: true }
        );
        summary.messagesCopied += 1;
      }

      lastMsgDoc = msgSnapshot.docs[msgSnapshot.docs.length - 1];
      if (msgSnapshot.docs.length < opts.pageSize) {
        keepPaging = false;
      }
      if (opts.pageSize > 0) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    await threadDoc.ref.set(
      {
        isAlias: true,
        aliasTo: targetThreadId,
        canonicalJid: normalized.canonicalJid,
        mergedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    summary.aliasMarkedCount += 1;
    summary.threadsMerged += 1;
  }

  summary.topMergeCandidates = mergeCandidates.slice(0, 10);

  console.log(JSON.stringify(summary));
  process.exit(apply ? 2 : 0);
})();
