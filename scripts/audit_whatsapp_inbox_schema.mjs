#!/usr/bin/env node
/**
 * Audit WhatsApp Inbox Firestore schema (read-only).
 *
 * Uses firebase-admin with application default credentials.
 * CLI: --project <id> [--accountId <id> ... | --accountIdsFile <path>] [--sampleThreads 50]
 *
 * Runs the canonical threads query per accountId, validates thread + message schema,
 * logs anomalies. Exits non-zero if >5% of threads missing lastMessageAt.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const DEFAULT_SAMPLE_THREADS = 50;
const ANOMALY_THRESHOLD_PCT = 5; // exit non-zero if >5% threads missing lastMessageAt

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null, accountIds: [], accountIdsFile: null, sampleThreads: DEFAULT_SAMPLE_THREADS };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--accountId' && args[i + 1]) { out.accountIds.push(args[++i]); continue; }
    if (args[i] === '--accountIdsFile' && args[i + 1]) { out.accountIdsFile = args[++i]; continue; }
    if (args[i] === '--sampleThreads' && args[i + 1]) { out.sampleThreads = Math.max(1, parseInt(args[++i], 10) || DEFAULT_SAMPLE_THREADS); continue; }
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

function validateThreadDoc(threadId, d, anomalies) {
  const keys = Object.keys(d);
  if (!d.accountId || typeof d.accountId !== 'string' || String(d.accountId).trim() === '') {
    anomalies.push({ type: 'thread', id: threadId, field: 'accountId', keys });
  }
  if (!isFirestoreTimestamp(d.lastMessageAt)) {
    anomalies.push({ type: 'thread', id: threadId, field: 'lastMessageAt', keys });
  }
  if (d.clientJid != null && typeof d.clientJid !== 'string') {
    anomalies.push({ type: 'thread', id: threadId, field: 'clientJid', keys });
  }
}

function validateMessageDoc(threadId, msgId, d, anomalies) {
  const keys = Object.keys(d);
  const dir = d.direction;
  if (dir !== 'inbound' && dir !== 'outbound') {
    anomalies.push({ type: 'message', threadId, id: msgId, field: 'direction', keys });
  }
  const hasTs = isFirestoreTimestamp(d.tsClient) || isFirestoreTimestamp(d.createdAt);
  if (!hasTs) {
    anomalies.push({ type: 'message', threadId, id: msgId, field: 'tsClient|createdAt', keys });
  }
  if (!Object.prototype.hasOwnProperty.call(d, 'body')) {
    anomalies.push({ type: 'message', threadId, id: msgId, field: 'body', keys });
  }
  // mediaType optional – no check
}

async function runAudit() {
  const { project, accountIds, sampleThreads } = parseArgs();
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
    console.error('    Then run from functions/ so Node finds firebase-admin:');
    console.error('    cd functions && node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId <ID>');
    console.error('  • export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json');
    process.exit(1);
  }

  const db = admin.firestore();
  const allAnomalies = [];
  let totalThreads = 0;
  let missingLastMessageAt = 0;

  console.log('🔍 WhatsApp Inbox schema audit');
  console.log('─'.repeat(60));
  console.log(`   Project: ${project}`);
  console.log(`   AccountIds: ${accountIds.join(', ')}`);
  console.log(`   Sample threads (messages): ${sampleThreads}`);
  console.log('');

  for (const accountId of accountIds) {
    let threadsCount = 0;
    let newestLastMessageAt = null;

    try {
      const snapshot = await canonicalThreadsQuery(db, accountId).get();
      threadsCount = snapshot.size;
      const threads = snapshot.docs;

      if (threads.length > 0) {
        const newest = threads[0];
        const d = newest.data();
        const ts = d.lastMessageAt;
        if (isFirestoreTimestamp(ts)) {
          newestLastMessageAt = new Date(ts.toMillis()).toISOString();
        }
      }

      console.log(`📬 accountId=${accountId}  threadsCount=${threadsCount}  newestLastMessageAt=${newestLastMessageAt ?? 'N/A'}`);

      const topN = threads.slice(0, sampleThreads);
      for (const td of topN) {
        const threadId = td.id;
        const d = td.data();
        totalThreads += 1;
        if (!isFirestoreTimestamp(d.lastMessageAt)) {
          missingLastMessageAt += 1;
        }
        validateThreadDoc(threadId, d, allAnomalies);

        try {
          const msgSnap = await db.collection('threads').doc(threadId).collection('messages').limit(20).get();
          for (const md of msgSnap.docs) {
            validateMessageDoc(threadId, md.id, md.data(), allAnomalies);
          }
        } catch (e) {
          console.warn(`   ⚠️ thread ${threadId} messages fetch error: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`❌ accountId=${accountId} query failed: ${e.message}`);
      const c = e.code || e.status || '';
      const msg = String(e.message || '');
      if (String(c).includes('failed-precondition') || c === 9) console.error('   FAILED_PRECONDITION: missing Firestore index for accountId+lastMessageAt.');
      if (String(c).includes('permission-denied') || c === 7) console.error('   PERMISSION_DENIED: check Firestore rules.');
      if (/default credentials|Could not load.*credential/i.test(msg)) {
        console.error('');
        console.error('   Credentials: run  gcloud auth application-default login');
        console.error('   Then:  cd functions && node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId <ID>');
      }
    }
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log('Schema anomalies (logged):');
  if (allAnomalies.length === 0) {
    console.log('   None.');
  } else {
    for (const a of allAnomalies) {
      if (a.type === 'thread') {
        console.log(`   [thread] ${a.id} missing/wrong: ${a.field} | keys: ${a.keys.slice(0, 12).join(', ')}`);
      } else {
        console.log(`   [message] ${a.threadId}/${a.id} missing/wrong: ${a.field} | keys: ${a.keys.slice(0, 12).join(', ')}`);
      }
    }
  }

  const pct = totalThreads > 0 ? (missingLastMessageAt / totalThreads) * 100 : 0;
  console.log('');
  console.log(`Summary: scannedThreads=${totalThreads} missingLastMessageAt=${missingLastMessageAt} (${pct.toFixed(1)}%) anomalies=${allAnomalies.length}`);

  if (pct > ANOMALY_THRESHOLD_PCT) {
    console.error(`❌ Exit: >${ANOMALY_THRESHOLD_PCT}% of threads missing lastMessageAt.`);
    process.exit(1);
  }
  if (allAnomalies.length > 0) {
    console.log('⚠️ Anomalies found but below lastMessageAt threshold. Review logs above.');
  }
}

runAudit().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
