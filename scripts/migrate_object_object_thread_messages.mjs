#!/usr/bin/env node
/**
 * Migrate messages from invalid threads ([object Object] / [obiect Obiect]) into
 * correct per-contact threads. Each message has clientJidRaw or clientJid; we use
 * that to build target threadId = accountId__jid and copy the message there.
 *
 * Usage (from project root):
 *   node scripts/migrate_object_object_thread_messages.mjs --project superparty-frontend [--dry-run] [--hide-after]
 *
 *   --dry-run     Only list invalid threads and messages; no writes.
 *   --hide-after  After migrating, set hidden=true, archived=true on invalid threads.
 *   Default: migrate messages only (no hide).
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
  const fpath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fpath) {
    const v = tryPath(fpath);
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
  const a = process.argv.slice(2);
  let project = null;
  let dryRun = false;
  let hideAfter = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--project' && a[i + 1]) {
      project = a[++i];
      continue;
    }
    if (a[i] === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a[i] === '--hide-after') {
      hideAfter = true;
      continue;
    }
  }
  return { project, dryRun, hideAfter };
}

const BAD = ['[object Object]', '[obiect Obiect]'];

function isInvalidThreadId(id) {
  if (!id || typeof id !== 'string') return false;
  return BAD.some((s) => id.includes(s));
}

function isInvalidJid(jid) {
  if (!jid || typeof jid !== 'string') return true;
  return BAD.some((s) => jid.includes(s));
}

function extractJid(msg) {
  const raw = msg.clientJidRaw;
  if (raw && typeof raw === 'string' && !isInvalidJid(raw)) return raw;
  const cj = msg.clientJid;
  if (typeof cj === 'string' && !isInvalidJid(cj)) return cj;
  if (cj && typeof cj === 'object') {
    const r = cj.rawJid || cj.canonicalJid || cj.jid;
    if (r && typeof r === 'string' && !isInvalidJid(r)) return r;
  }
  return null;
}

async function getAllMessages(msgsRef, batchSize = 400) {
  const out = [];
  let last = null;
  for (;;) {
    let q = msgsRef.orderBy('__name__').limit(batchSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach((d) => out.push({ id: d.id, ref: d.ref, data: d.data() }));
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < batchSize) break;
  }
  return out;
}

async function main() {
  const { project, dryRun, hideAfter } = parseArgs();
  if (!project) {
    console.error('Usage: node scripts/migrate_object_object_thread_messages.mjs --project <project> [--dry-run] [--hide-after]');
    process.exit(1);
  }

  const cred = loadServiceAccount();
  if (!cred) {
    console.error('Missing Firebase credentials. Set GOOGLE_APPLICATION_CREDENTIALS or serviceAccountKey.json.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: project,
    });
  }
  const db = admin.firestore();

  console.log(`Mode: ${dryRun ? 'dry-run' : 'migrate'}${hideAfter ? ' + hide-after' : ''}`);

  const threadsRef = db.collection('threads');
  let lastDoc = null;
  const invalid = [];
  const limit = 1000;

  while (true) {
    let q = threadsRef.limit(limit);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      if (isInvalidThreadId(d.id)) {
        const data = d.data() || {};
        invalid.push({
          id: d.id,
          ref: d.ref,
          accountId: data.accountId || d.id.split('__')[0] || null,
        });
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < limit) break;
  }

  console.log(`Found ${invalid.length} invalid thread(s).`);

  for (const th of invalid) {
    console.log(`\nThread: ${th.id} (accountId=${th.accountId || 'unknown'})`);
    const msgsRef = th.ref.collection('messages');
    const messages = await getAllMessages(msgsRef);
    console.log(`  Messages: ${messages.length}`);

    const byJid = new Map();
    for (const m of messages) {
      const jid = extractJid(m.data);
      if (!jid) {
        console.log(`  Skip msg ${m.id}: no valid clientJid/clientJidRaw`);
        continue;
      }
      if (!byJid.has(jid)) byJid.set(jid, []);
      byJid.get(jid).push(m);
    }

    const jids = [...byJid.keys()];
    console.log(`  Distinct JIDs: ${jids.length} ${jids.slice(0, 5).join(', ')}${jids.length > 5 ? '...' : ''}`);

    if (dryRun) continue;

    if (!th.accountId) {
      console.log(`  Skip migrate: no accountId`);
      continue;
    }

    const batchSize = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const jid of jids) {
      const targetThreadId = `${th.accountId}__${jid}`;
      const targetThreadRef = db.collection('threads').doc(targetThreadId);
      const targetMsgsRef = targetThreadRef.collection('messages');

      const threadPayload = {
        accountId: th.accountId,
        clientJid: jid,
        rawJid: jid,
        canonicalThreadId: targetThreadId,
        migratedFromObjectObjectThread: th.id,
      };

      batch.set(targetThreadRef, threadPayload, { merge: true });
      batchCount++;

      for (const m of byJid.get(jid)) {
        const copy = { ...m.data };
        copy.migratedFromObjectObjectThread = th.id;
        copy.canonicalThreadId = targetThreadId;
        copy.threadId = targetThreadId;
        if (typeof copy.clientJid === 'object' && copy.clientJid) {
          copy.clientJidRaw = copy.clientJidRaw || copy.clientJid.rawJid || copy.clientJid.canonicalJid || jid;
        } else if (!copy.clientJidRaw && typeof copy.clientJid === 'string') {
          copy.clientJidRaw = copy.clientJid;
        }
        const targetMsgRef = targetMsgsRef.doc(m.id);
        batch.set(targetMsgRef, copy, { merge: true });
        batchCount++;
        if (batchCount >= batchSize) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) await batch.commit();
    console.log(`  Migrated ${messages.length} message(s) to ${jids.length} thread(s).`);

    if (hideAfter) {
      await th.ref.update({ hidden: true, archived: true });
      console.log(`  Marked invalid thread hidden+archived.`);
    }
  }

  if (invalid.length === 0) console.log('Nothing to do.');
  else console.log(`\nDone. Processed ${invalid.length} invalid thread(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
