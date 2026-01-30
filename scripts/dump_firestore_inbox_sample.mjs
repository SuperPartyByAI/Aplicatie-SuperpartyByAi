#!/usr/bin/env node
/**
 * Dump one thread + sample messages from Firestore as JSON (read-only).
 * Use this to verify "as saved" structure vs Firebase Console.
 *
 * Usage (from project root):
 *   node scripts/dump_firestore_inbox_sample.mjs --project superparty-frontend --accountId account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443
 *   node scripts/dump_firestore_inbox_sample.mjs --project superparty-frontend --threadId "account_prod_f869ce13d00bc7d7aa13ef18c16f3bd5__[obiect Obiect]"
 *
 * Optional: --messages 10 (default 5)
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
  if (gac) { const v = tryPath(gac); if (v) return v; }
  const fpath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fpath) { const v = tryPath(fpath); if (v) return v; }
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json', 'serviceAccountKey.json']) {
    const v = tryPath(path.join(cwd, rel)) || tryPath(path.join(cwd, '..', rel));
    if (v) return v;
  }
  return null;
}

function parseArgs() {
  const a = process.argv.slice(2);
  let project = null, accountId = null, threadId = null, messagesLimit = 5;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--project' && a[i + 1]) { project = a[++i]; continue; }
    if (a[i] === '--accountId' && a[i + 1]) { accountId = a[++i]; continue; }
    if (a[i] === '--threadId' && a[i + 1]) { threadId = a[++i]; continue; }
    if (a[i] === '--messages' && a[i + 1]) { messagesLimit = Math.max(1, parseInt(a[++i], 10) || 5); continue; }
  }
  return { project, accountId, threadId, messagesLimit };
}

function toJsonSafe(o) {
  if (o == null) return null;
  if (typeof o !== 'object') return o;
  if (typeof o.toMillis === 'function') return { _timestamp: true, iso: new Date(o.toMillis()).toISOString(), ms: o.toMillis() };
  if (Array.isArray(o)) return o.map(toJsonSafe);
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = toJsonSafe(v);
  return out;
}

async function main() {
  const { project, accountId, threadId, messagesLimit } = parseArgs();
  if (!project) {
    console.error('Usage: node scripts/dump_firestore_inbox_sample.mjs --project <id> (--accountId <id> | --threadId <id>) [--messages N]');
    process.exit(1);
  }
  if (!accountId && !threadId) {
    console.error('Provide either --accountId or --threadId.');
    process.exit(1);
  }

  const cred = loadServiceAccount();
  if (!cred) {
    console.error('Missing Firebase credentials. Set GOOGLE_APPLICATION_CREDENTIALS or serviceAccountKey.json.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: project });
  }
  const db = admin.firestore();

  let docRef;
  if (threadId) {
    docRef = db.collection('threads').doc(threadId);
  } else {
    const snap = await db.collection('threads')
      .where('accountId', '==', accountId)
      .orderBy('lastMessageAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) {
      console.error(`No thread found for accountId=${accountId}`);
      process.exit(1);
    }
    docRef = snap.docs[0].ref;
  }

  const threadSnap = await docRef.get();
  if (!threadSnap.exists) {
    console.error(`Thread not found: ${docRef.id}`);
    process.exit(1);
  }

  const threadData = toJsonSafe(threadSnap.data());
  const msgsSnap = await docRef.collection('messages')
    .orderBy('tsClient', 'desc')
    .limit(messagesLimit)
    .get();

  const messages = msgsSnap.docs.map((d) => ({ id: d.id, ...toJsonSafe(d.data()) }));

  console.log(JSON.stringify({
    threadId: docRef.id,
    thread: threadData,
    messagesCount: msgsSnap.size,
    messages,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
