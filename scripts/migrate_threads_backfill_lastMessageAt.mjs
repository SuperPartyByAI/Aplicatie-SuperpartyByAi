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
  const tryJson = (raw) => {
    try {
      const j = typeof raw === 'string' ? JSON.parse(raw.trim()) : raw;
      if (j && j.private_key && j.client_email) return j;
    } catch (_) {}
    return null;
  };
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) { const v = tryPath(gac); if (v) return { serviceAccount: v, source: 'GOOGLE_APPLICATION_CREDENTIALS' }; }
  const fpath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fpath) { const v = tryPath(fpath); if (v) return { serviceAccount: v, source: 'FIREBASE_SERVICE_ACCOUNT_PATH' }; }
  const fjson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fjson) {
    const s = fjson.trim();
    const v = (s.startsWith('{') || s.startsWith('[')) ? tryJson(s) : tryPath(s);
    if (v) return { serviceAccount: v, source: 'FIREBASE_SERVICE_ACCOUNT_JSON' };
  }
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json', 'serviceAccountKey.json']) {
    const v = tryPath(path.join(cwd, rel));
    if (v) return { serviceAccount: v, source: rel };
  }
  const up = path.join(cwd, '..');
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json']) {
    const v = tryPath(path.join(up, rel));
    if (v) return { serviceAccount: v, source: `../${rel}` };
  }
  return null;
}

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

  const loaded = loadServiceAccount();
  let app;
  try {
    if (loaded) {
      app = admin.initializeApp({
        credential: admin.credential.cert(loaded.serviceAccount),
        projectId: project,
      });
      if (process.env.DEBUG_AUDIT) console.log(`   Credentials: ${loaded.source}`);
    } else {
      app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: project,
      });
    }
  } catch (e) {
    console.error('❌ Firebase Admin init failed:', e.message);
    console.error('');
    console.error('Use one of: GOOGLE_APPLICATION_CREDENTIALS / serviceAccountKey.json or gcloud ADC. See VERIFICATION_WHATSAPP_INBOX.md.');
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
        console.error(`
No valid credentials — query did NOT run. Fix creds then re-run.

Option 1 (ADC):
  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform --no-browser
  gcloud config set project superparty-frontend
  gcloud auth application-default set-quota-project superparty-frontend
  ls -la ~/.config/gcloud/application_default_credentials.json
  cd /path/to/Aplicatie-SuperpartyByAi/functions
  node ../scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ID> [--dryRun|--apply]

Option 2 (service account JSON):
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account.json"
  cd /path/to/Aplicatie-SuperpartyByAi/functions
  node ../scripts/migrate_threads_backfill_lastMessageAt.mjs --project superparty-frontend --accountId <ID> [--dryRun|--apply]

See VERIFICATION_WHATSAPP_INBOX.md for full details.
`.trim());
        process.exit(1);
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
