#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
};

const serviceAccountPath = getArg('--serviceAccount') || process.env.SERVICE_ACCOUNT_PATH;
const apply = args.includes('--apply');
const limitArg = getArg('--limit');
const maxAgeDaysArg = getArg('--maxAgeDays');
const limit = limitArg ? Number(limitArg) : null;
const maxAgeDays = maxAgeDaysArg ? Number(maxAgeDaysArg) : 30;

if (!serviceAccountPath) {
  console.error('Missing --serviceAccount path (or SERVICE_ACCOUNT_PATH env).');
  process.exit(1);
}

const resolvedPath = path.resolve(serviceAccountPath);
const serviceAccountRaw = fs.readFileSync(resolvedPath, 'utf8');
const serviceAccount = JSON.parse(serviceAccountRaw);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

const getLastUpdateMs = (data) => {
  const candidates = [data.updatedAt, data.lastMessageAt, data.createdAt];
  for (const candidate of candidates) {
    if (candidate?.toDate) return candidate.toDate().getTime();
    if (candidate instanceof Date) return candidate.getTime();
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
};

const isLegacyThreadId = (docId) => !docId.includes('__');

const scanThreads = async (onDoc) => {
  let query = db.collection('threads').orderBy(admin.firestore.FieldPath.documentId()).limit(500);
  let lastDoc = null;
  let processed = 0;

  while (true) {
    let page = query;
    if (lastDoc) page = page.startAfter(lastDoc);
    const snap = await page.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      processed += 1;
      if (limit && processed > limit) return processed;
      await onDoc(doc);
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return processed;
};

const main = async () => {
  console.log(`Scanning threads for legacy IDs (dryRun=${!apply})...`);
  const candidates = [];

  await scanThreads(async (doc) => {
    const docId = doc.id;
    if (!isLegacyThreadId(docId)) return;
    const data = doc.data();
    const lastUpdateMs = getLastUpdateMs(data);
    if (!lastUpdateMs || lastUpdateMs > cutoffMs) return;
    candidates.push({ docRef: doc.ref, docId, lastUpdateMs });
  });

  candidates.sort((a, b) => a.lastUpdateMs - b.lastUpdateMs);
  console.log(`Found ${candidates.length} legacy threads older than ${maxAgeDays} days.`);
  candidates.slice(0, 10).forEach((item) => {
    console.log(`- ${item.docId} lastUpdated=${new Date(item.lastUpdateMs).toISOString()}`);
  });

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to delete.');
    return;
  }

  let deleted = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const item of candidates) {
    batch.delete(item.docRef);
    batchCount += 1;
    deleted += 1;
    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Done. deleted=${deleted}`);
};

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
