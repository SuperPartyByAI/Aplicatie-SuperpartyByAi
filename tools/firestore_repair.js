#!/usr/bin/env node
/* eslint-disable no-console */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeRemoteFromJid(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const raw = jid.split('@')[0] || '';
  return raw.replace(/\D/g, '');
}

function toEpochMs(value) {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value._seconds) return value._seconds * 1000;
  return 0;
}

function formatTimestamp(value) {
  if (!value) return 'unknown';
  if (value.toDate) return value.toDate().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') return value;
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  return 'unknown';
}

function isBadDisplayName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '-') return true;
  return false;
}

async function batchCommit(db, operations) {
  const chunks = [];
  for (let i = 0; i < operations.length; i += 400) {
    chunks.push(operations.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const op of chunk) {
      batch[op.type](op.ref, op.data, op.options);
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

async function getLatestMessage(threadRef, limit = 1) {
  const messagesRef = threadRef.collection('messages');
  try {
    const snap = await messagesRef.orderBy('tsClient', 'desc').limit(limit).get();
    return snap.docs;
  } catch (err) {
    const snap = await messagesRef.orderBy('tsServer', 'desc').limit(limit).get();
    return snap.docs;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const serviceAccountPath = args.serviceAccount;
  const accountId = args.accountId;
  const limit = Number(args.limit || 200);
  const apply = Boolean(args.apply);
  const dryRun = args.dryRun === true || !apply;

  if (!serviceAccountPath || !accountId) {
    console.error('Usage: node tools/firestore_repair.js --serviceAccount <path> --accountId <id> [--dryRun] [--apply] [--limit 200]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Service account file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const serviceAccount = require(resolvedPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  const threadsRef = db.collection('threads');

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`AccountId: ${accountId}`);
  console.log(`Limit: ${limit}`);

  console.log('\nVERIFY: latest 20 threads');
  const latestSnap = await threadsRef
    .where('accountId', '==', accountId)
    .orderBy('lastMessageAt', 'desc')
    .limit(20)
    .get();
  latestSnap.docs.forEach((doc) => {
    const data = doc.data();
    console.log(
      `${doc.id} | ${data.clientJid || 'n/a'} | ${data.displayName || 'n/a'} | ` +
      `${formatTimestamp(data.lastMessageAt)} | ${data.lastMessagePreview || data.lastMessageText || ''}`,
    );
  });

  console.log('\nVERIFY: scanning threads');
  const scanSnap = await threadsRef
    .where('accountId', '==', accountId)
    .limit(limit)
    .get();

  const threads = scanSnap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    data: doc.data(),
  }));

  const nameCounts = new Map();
  for (const thread of threads) {
    const name = (thread.data.displayName || '').trim();
    if (!name) continue;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  let notUpdatedCount = 0;
  const notUpdatedThreads = [];
  for (const thread of threads) {
    const docs = await getLatestMessage(thread.ref, 1);
    const latestDoc = docs[0];
    if (!latestDoc) continue;
    const msgData = latestDoc.data();
    const latestTs = toEpochMs(msgData.tsClient || msgData.tsServer);
    const threadTs = toEpochMs(thread.data.lastMessageAt);
    if (latestTs && threadTs && Math.abs(latestTs - threadTs) > 120000) {
      notUpdatedCount += 1;
      notUpdatedThreads.push({ id: thread.id, diffSec: Math.round(Math.abs(latestTs - threadTs) / 1000) });
    }
  }
  if (notUpdatedThreads.length > 0) {
    console.log(`THREAD NOT UPDATED: ${notUpdatedCount}`);
    notUpdatedThreads.slice(0, 10).forEach((entry) => {
      console.log(`- ${entry.id} (${entry.diffSec}s)`);
    });
  } else {
    console.log('THREAD UPDATED: lastMessageAt matches latest message.');
  }

  console.log('\nVERIFY: detecting duplicate threads');
  const grouped = new Map();
  for (const thread of threads) {
    const remote = normalizeRemoteFromJid(thread.data.clientJid || '');
    if (!remote) continue;
    const key = `${accountId}__${remote}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(thread);
  }

  const duplicates = [];
  for (const [key, group] of grouped.entries()) {
    if (group.length > 1) {
      duplicates.push({ key, group });
    }
  }
  console.log(`Duplicates found: ${duplicates.length}`);

  let movedMessages = 0;
  let archivedThreads = 0;
  let displayNameFixed = 0;
  let outboundDuplicates = 0;

  if (!dryRun) {
    console.log('\nREPAIR: dedupe threads (archive losers)');
  }

  for (const dup of duplicates) {
    const sorted = [...dup.group].sort((a, b) => {
      const aTs = toEpochMs(a.data.lastMessageAt);
      const bTs = toEpochMs(b.data.lastMessageAt);
      return bTs - aTs;
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);
    if (!dryRun) {
      console.log(`- Winner: ${winner.id} | losers: ${losers.map((l) => l.id).join(', ')}`);
    }

    for (const loser of losers) {
      const loserMessages = await loser.ref.collection('messages').get();
      const batchOps = [];
      for (const doc of loserMessages.docs) {
        const targetRef = winner.ref.collection('messages').doc(doc.id);
        batchOps.push({
          type: 'set',
          ref: targetRef,
          data: doc.data(),
          options: { merge: false },
        });
      }
      if (dryRun) {
        movedMessages += loserMessages.size;
      } else {
        // Use create if not exists to avoid overwriting
        const refs = loserMessages.docs.map((doc) => winner.ref.collection('messages').doc(doc.id));
        const existing = await db.getAll(...refs);
        const createOps = [];
        for (let i = 0; i < loserMessages.docs.length; i += 1) {
          if (!existing[i].exists) {
            createOps.push(batchOps[i]);
          }
        }
        await batchCommit(db, createOps);
        movedMessages += createOps.length;
        await loser.ref.set({
          archived: true,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          archiveReason: 'dedupe',
        }, { merge: true });
        archivedThreads += 1;
      }
    }
  }

  console.log('\nREPAIR: displayName cleanup');
  const displayOps = [];
  for (const thread of threads) {
    const name = (thread.data.displayName || '').trim();
    const isCommon = name && (nameCounts.get(name) || 0) >= 5;
    if (isBadDisplayName(name) || isCommon) {
      displayNameFixed += 1;
      if (!dryRun) {
        displayOps.push({
          type: 'set',
          ref: thread.ref,
          data: {
            displayName: null,
            displayNameSource: 'repair',
            displayNameUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          options: { merge: true },
        });
      }
    }
  }
  if (!dryRun && displayOps.length > 0) {
    await batchCommit(db, displayOps);
  }

  console.log('\nREPAIR: outbound duplicate messages');
  for (const thread of threads.slice(0, limit)) {
    const docs = await getLatestMessage(thread.ref, limit);
    const groupedOutbound = new Map();
    for (const doc of docs) {
      const data = doc.data();
      const isOutbound = data.fromMe === true ||
        data.direction === 'outbound' ||
        data.direction === 'out';
      const key = data.clientMessageId || data.requestId;
      if (!isOutbound || !key) continue;
      if (!groupedOutbound.has(key)) groupedOutbound.set(key, []);
      groupedOutbound.get(key).push(doc);
    }
    for (const [key, group] of groupedOutbound.entries()) {
      if (group.length < 2) continue;
      outboundDuplicates += group.length - 1;
      if (!dryRun) {
        const toDelete = group.slice(1);
        const ops = toDelete.map((doc) => ({
          type: 'set',
          ref: doc.ref,
          data: {
            deleted: true,
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            deleteReason: `duplicate-outbound:${key}`,
          },
          options: { merge: true },
        }));
        await batchCommit(db, ops);
      }
    }
  }

  console.log('\nRESULTS:');
  console.log(`- duplicates: ${duplicates.length}`);
  console.log(`- movedMessages: ${movedMessages}`);
  console.log(`- archivedThreads: ${archivedThreads}`);
  console.log(`- displayNameFixed: ${displayNameFixed}`);
  console.log(`- outboundDuplicatesMarked: ${outboundDuplicates}`);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
