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
const limit = limitArg ? Number(limitArg) : null;

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

const looksLikePhone = (value) => {
  if (!value) return false;
  const v = String(value).trim();
  if (!v) return false;
  return /^\+?[\d\s\-\(\)]{6,}$/.test(v);
};

const normalizeDisplayName = (value) => String(value ?? '').trim();

const extractPhoneFromJid = (jid) => {
  if (!jid) return null;
  const base = String(jid).split('@')[0];
  const digits = base.replace(/\D/g, '');
  return digits ? `+${digits}` : null;
};

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

const statsByAccount = new Map();

const ensureAccountStats = (accountId) => {
  if (!statsByAccount.has(accountId)) {
    statsByAccount.set(accountId, { total: 0, counts: new Map() });
  }
  return statsByAccount.get(accountId);
};

const main = async () => {
  console.log(`Scanning threads (dryRun=${!apply})...`);

  await scanThreads(async (doc) => {
    const data = doc.data();
    const accountId = String(data.accountId || '');
    const displayName = normalizeDisplayName(data.displayName);
    if (!accountId || !displayName || looksLikePhone(displayName)) return;
    const stats = ensureAccountStats(accountId);
    stats.total += 1;
    stats.counts.set(displayName, (stats.counts.get(displayName) || 0) + 1);
  });

  const dominantByAccount = new Map();
  for (const [accountId, stats] of statsByAccount.entries()) {
    let topName = null;
    let topCount = 0;
    for (const [name, count] of stats.counts.entries()) {
      if (count > topCount) {
        topName = name;
        topCount = count;
      }
    }
    const ratio = stats.total > 0 ? topCount / stats.total : 0;
    if (topName && ratio >= 0.3) {
      dominantByAccount.set(accountId, { name: topName, ratio, total: stats.total });
    }
  }

  console.log(`Accounts with dominant displayName: ${dominantByAccount.size}`);
  for (const [accountId, info] of dominantByAccount.entries()) {
    console.log(`- ${accountId}: "${info.name}" (${Math.round(info.ratio * 100)}% of ${info.total})`);
  }

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to update threads.');
    return;
  }

  let updated = 0;
  let scanned = 0;
  let batch = db.batch();
  let batchCount = 0;

  await scanThreads(async (doc) => {
    scanned += 1;
    const data = doc.data();
    const accountId = String(data.accountId || '');
    const displayName = normalizeDisplayName(data.displayName);
    const dominant = dominantByAccount.get(accountId);
    if (!dominant || displayName !== dominant.name) return;

    const phone = extractPhoneFromJid(data.clientJid);
    if (!phone) return;

    batch.update(doc.ref, { displayName: phone });
    batchCount += 1;
    updated += 1;

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  });

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Done. scanned=${scanned}, updated=${updated}`);
};

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
