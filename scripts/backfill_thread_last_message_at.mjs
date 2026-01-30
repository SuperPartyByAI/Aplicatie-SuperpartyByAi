#!/usr/bin/env node
/**
 * Backfill thread lastMessageAt / lastMessageAtMs from last message in subcollection.
 * Use when threads have incorrect or missing lastMessageAt (e.g. before outbound
 * thread-only update fix). Run per accountId for staff/employee accounts.
 *
 * For each thread:
 *   - Last message in threads/{id}/messages (orderBy tsClient desc) → set lastMessageAt, lastMessageAtMs
 *   - Else thread.updatedAt → set both
 *   - Else keep existing (no write)
 *
 * Usage:
 *   node scripts/backfill_thread_last_message_at.mjs --project superparty-frontend \
 *     --accountId account_prod_XXX [--accountId ...] [--dry-run] [--limit 500]
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or serviceAccountKey.json (see check_firestore_history).
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

function loadServiceAccount() {
  const cwd = process.cwd();
  const tryPath = (p) => {
    if (!p || !existsSync(p)) return null;
    try {
      const raw = readFileSync(p, 'utf8');
      const j = JSON.parse(raw);
      if (j && j.private_key && j.client_email) return j;
    } catch (_) {}
    return null;
  };
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) {
    const v = tryPath(gac);
    if (v) return v;
  }
  for (const rel of [
    'functions/serviceAccountKey.json',
    'whatsapp-backend/serviceAccountKey.json',
    'serviceAccountKey.json',
  ]) {
    const v = tryPath(path.join(cwd, rel)) || tryPath(path.join(cwd, '..', rel));
    if (v) return v;
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null, accountIds: [], dryRun: false, limit: 500 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--accountId' && args[i + 1]) { out.accountIds.push(args[++i]); continue; }
    if (args[i] === '--dry-run') { out.dryRun = true; continue; }
    if (args[i] === '--limit' && args[i + 1]) { out.limit = Math.max(1, parseInt(args[++i], 10) || 500); continue; }
  }
  return out;
}

function extractMs(doc) {
  const data = (typeof doc.data === 'function' ? doc.data() : {}) || {};
  if (data.tsClient) {
    const t = data.tsClient;
    if (t && typeof t.toMillis === 'function') return t.toMillis();
    if (t && typeof t._seconds === 'number') return t._seconds * 1000;
    if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  }
  if (data.createdAt) {
    const t = data.createdAt;
    if (t && typeof t.toMillis === 'function') return t.toMillis();
    if (t && typeof t._seconds === 'number') return t._seconds * 1000;
  }
  if (typeof data.createdAtMs === 'number') return data.createdAtMs;
  if (typeof data.tsClientMs === 'number') return data.tsClientMs;
  return null;
}

async function run() {
  const { project, accountIds, dryRun, limit } = parseArgs();
  if (!project || accountIds.length === 0) {
    console.error('Usage: node scripts/backfill_thread_last_message_at.mjs --project <project> --accountId <id> [--accountId ...] [--dry-run] [--limit 500]');
    process.exit(1);
  }

  const cred = loadServiceAccount();
  if (!cred) {
    console.error('No service account found. Set GOOGLE_APPLICATION_CREDENTIALS or add serviceAccountKey.json.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: project });
  }
  const db = admin.firestore();

  console.log(`Backfill lastMessageAt/lastMessageAtMs: project=${project} accounts=${accountIds.length} dryRun=${dryRun} limit=${limit}`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const accountId of accountIds) {
    const threadsSnap = await db.collection('threads')
      .where('accountId', '==', accountId)
      .limit(limit)
      .get();

    console.log(`  [${accountId}] threads=${threadsSnap.size}`);

    for (const tDoc of threadsSnap.docs) {
      const threadId = tDoc.id;
      const thread = tDoc.data() || {};
      const msgsRef = db.collection('threads').doc(threadId).collection('messages');

      let lastMs = null;
      try {
        const msgsSnap = await msgsRef.orderBy('tsClient', 'desc').limit(1).get();
        if (!msgsSnap.empty) {
          lastMs = extractMs(msgsSnap.docs[0]);
        }
      } catch (_) {
        try {
          const msgsSnap = await msgsRef.orderBy('createdAt', 'desc').limit(1).get();
          if (!msgsSnap.empty) lastMs = extractMs(msgsSnap.docs[0]);
        } catch (__) {}
      }

      if (lastMs == null) {
        const u = thread.updatedAt;
        if (u && typeof u.toMillis === 'function') lastMs = u.toMillis();
        else if (u && (u._seconds != null)) lastMs = (u._seconds || 0) * 1000;
      }

      if (lastMs == null) {
        totalSkipped++;
        continue;
      }

      const lastMessageAt = admin.firestore.Timestamp.fromMillis(lastMs);
      const update = { lastMessageAt, lastMessageAtMs: lastMs };

      if (!dryRun) {
        try {
          await db.collection('threads').doc(threadId).set(update, { merge: true });
          totalUpdated++;
        } catch (e) {
          console.warn(`    [${threadId.slice(0, 40)}...] write error: ${e.message}`);
          totalErrors++;
        }
      } else {
        totalUpdated++;
      }
    }
  }

  console.log(`Done: updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors}${dryRun ? ' (dry-run)' : ''}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
