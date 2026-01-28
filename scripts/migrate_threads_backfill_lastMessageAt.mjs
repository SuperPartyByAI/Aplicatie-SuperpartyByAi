#!/usr/bin/env node
/**
 * Migrate threads: backfill lastMessageAt from messages subcollection (SAFE, guarded).
 *
 * Default: DRY RUN (no writes). Use --apply to write.
 * CLI: --project <id> [--accountId <id> ... | --accountIdsFile <path>] [--dryRun] [--apply]
 *
 * For each thread where lastMessageAt is missing or not a Timestamp:
 * - Query threads/{threadId}/messages by tsClient desc (fallback createdAt desc)
 * - Set thread.lastMessageAt to latest message timestamp.
 * Never modifies accountId. Prints: scannedThreads, wouldUpdate/updated, skipped.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null, accountIds: [], accountIdsFile: null, apply: false, dryRun: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--accountId' && args[i + 1]) { out.accountIds.push(args[++i]); continue; }
    if (args[i] === '--accountIdsFile' && args[i + 1]) { out.accountIdsFile = args[++i]; continue; }
    if (args[i] === '--apply') { out.apply = true; out.dryRun = false; continue; }
    if (args[i] === '--dryRun') { out.dryRun = true; continue; }
  }
  if (out.accountIdsFile) {
    try {
      const buf = readFileSync(out.accountIdsFile, 'utf8');
      const ids = buf.split(/\n/).map((s) => s.trim()).filter(Boolean);
      out.accountIds.push(...ids);
    } catch (e) {
      console.error(`❌ Failed to read --accountIdsFile ${out.accountIdsFile}: ${e.message}`);
      process.exit(1);
    }
  }
  return out;
}

function isFirestoreTimestamp(v) {
  return v != null && typeof v.toMillis === 'function';
}

function canonicalThreadsQuery(db, accountId) {
  return db.collection('threads')
    .where('accountId', '==', accountId)
    .orderBy('lastMessageAt', 'desc')
    .limit(200);
}

/** Scan threads by accountId only (no orderBy). Use for migration to find docs missing lastMessageAt. */
function scanThreadsByAccount(db, accountId, limit = 500) {
  return db.collection('threads')
    .where('accountId', '==', accountId)
    .limit(limit);
}

async function getLatestMessageTimestamp(db, threadId) {
  const col = db.collection('threads').doc(threadId).collection('messages');
  let snap;
  try {
    snap = await col.orderBy('tsClient', 'desc').limit(1).get();
  } catch (_) {
    try {
      snap = await col.orderBy('createdAt', 'desc').limit(1).get();
    } catch (e) {
      return { err: e.message };
    }
  }
  if (snap.empty) return { ts: null };
  const d = snap.docs[0].data();
  const ts = isFirestoreTimestamp(d.tsClient) ? d.tsClient : (isFirestoreTimestamp(d.createdAt) ? d.createdAt : null);
  return { ts };
}

async function run() {
  const { project, accountIds, accountIdsFile, apply, dryRun } = parseArgs();
  if (!project) {
    console.error('❌ Missing --project (e.g. --project superparty-frontend)');
    process.exit(1);
  }
  if (accountIds.length === 0) {
    console.error('❌ Provide at least one --accountId or --accountIdsFile');
    process.exit(1);
  }

  let app;
  try {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: project,
    });
  } catch (e) {
    console.error('❌ Firebase Admin init failed:', e.message);
    console.error('');
    console.error('Use one of:');
    console.error('  • gcloud auth application-default login');
    console.error('    Then: cd functions && node ../scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ID> [--dryRun|--apply]');
    console.error('  • export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json');
    process.exit(1);
  }

  const db = admin.firestore();
  const stats = { scannedThreads: 0, wouldUpdate: 0, updated: 0, skipped: [] };

  console.log('🔄 Migrate threads: backfill lastMessageAt');
  console.log('─'.repeat(60));
  console.log(`   Project: ${project}`);
  console.log(`   AccountIds: ${accountIds.join(', ')}`);
  console.log(`   Mode: ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log('');

  for (const accountId of accountIds) {
    let snapshot;
    try {
      snapshot = await scanThreadsByAccount(db, accountId).get();
    } catch (e) {
      console.error(`❌ accountId=${accountId} query failed: ${e.message}`);
      const msg = String(e.message || '');
      if (/default credentials|Could not load.*credential/i.test(msg)) {
        console.error('   Credentials: run  gcloud auth application-default login');
        console.error('   Then:  cd functions && node ../scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ID> [--dryRun|--apply]');
      }
      continue;
    }

    for (const td of snapshot.docs) {
      const threadId = td.id;
      const d = td.data();
      stats.scannedThreads += 1;

      if (isFirestoreTimestamp(d.lastMessageAt)) {
        continue; // nothing to do
      }

      const { ts, err } = await getLatestMessageTimestamp(db, threadId);
      if (err) {
        stats.skipped.push({ threadId, reason: `messages fetch error: ${err}` });
        continue;
      }
      if (!ts) {
        stats.skipped.push({ threadId, reason: 'no messages or no tsClient/createdAt' });
        continue;
      }

      stats.wouldUpdate += 1;
      if (apply) {
        try {
          await db.collection('threads').doc(threadId).update({ lastMessageAt: ts });
          stats.updated += 1;
          console.log(`   ✅ updated ${threadId} lastMessageAt`);
        } catch (e) {
          stats.skipped.push({ threadId, reason: `update failed: ${e.message}` });
        }
      } else {
        console.log(`   [dry-run] would update ${threadId} lastMessageAt`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`Summary: scannedThreads=${stats.scannedThreads} wouldUpdate=${stats.wouldUpdate} updated=${stats.updated} skipped=${stats.skipped.length}`);
  if (stats.skipped.length > 0) {
    console.log('Skipped:');
    for (const s of stats.skipped.slice(0, 20)) {
      console.log(`   ${s.threadId}: ${s.reason}`);
    }
    if (stats.skipped.length > 20) {
      console.log(`   ... and ${stats.skipped.length - 20} more`);
    }
  }
  if (!apply && stats.wouldUpdate > 0) {
    console.log('');
    console.log('Run with --apply to perform writes.');
  }
}

run().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
