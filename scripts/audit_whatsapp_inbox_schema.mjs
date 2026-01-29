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
    console.error('Use one of:');
    console.error('  • Service account JSON: GOOGLE_APPLICATION_CREDENTIALS or functions/serviceAccountKey.json');
    console.error('  • gcloud auth application-default login (see VERIFICATION_WHATSAPP_INBOX.md)');
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
      const isCreds = /default credentials|Could not load.*credential/i.test(msg);
      if (isCreds) {
        console.error(`
No valid credentials — query did NOT run. Fix creds then re-run.

Option 1 (ADC):
  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform --no-browser
  gcloud config set project superparty-frontend
  gcloud auth application-default set-quota-project superparty-frontend
  ls -la ~/.config/gcloud/application_default_credentials.json
  cd /path/to/Aplicatie-SuperpartyByAi/functions
  node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId <ID>

Option 2 (service account JSON):
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account.json"
  cd /path/to/Aplicatie-SuperpartyByAi/functions
  node ../scripts/audit_whatsapp_inbox_schema.mjs --project superparty-frontend --accountId <ID>

See VERIFICATION_WHATSAPP_INBOX.md for full details.
`.trim());
        process.exit(1);
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
