#!/usr/bin/env node
/**
 * Cleanup invalid threads whose IDs contain [object Object] or [obiect Obiect].
 * These were created when remoteJid/contact.id was an object; we now guard with ensureJidString.
 *
 * Usage (from project root):
 *   node scripts/cleanup_object_object_threads.mjs --project superparty-frontend [--dry-run] [--hide]
 *
 *   --dry-run   Only list invalid threads; no writes.
 *   --hide      Set hidden=true, archived=true on invalid threads (non-destructive).
 *   --delete    Delete invalid threads and their messages subcollections (destructive).
 *   Default: --dry-run.
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
  let dryRun = true;
  let hide = false;
  let delete_ = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--project' && a[i + 1]) {
      project = a[++i];
      continue;
    }
    if (a[i] === '--dry-run') {
      dryRun = true;
      hide = false;
      delete_ = false;
      continue;
    }
    if (a[i] === '--hide') {
      hide = true;
      dryRun = false;
      delete_ = false;
      continue;
    }
    if (a[i] === '--delete') {
      delete_ = true;
      dryRun = false;
      hide = false;
      continue;
    }
  }
  return { project, dryRun, hide, delete: delete_ };
}

const BAD_SUBSTRINGS = ['[object Object]', '[obiect Obiect]'];

function isInvalidThreadId(id) {
  if (!id || typeof id !== 'string') return false;
  return BAD_SUBSTRINGS.some((s) => id.includes(s));
}

async function deleteCollection(ref, batchSize = 400) {
  const q = ref.orderBy('__name__').limit(batchSize);
  const snap = await q.get();
  if (snap.empty) return 0;
  const batch = ref.firestore.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size + (await deleteCollection(ref, batchSize));
}

async function main() {
  const { project, dryRun, hide, delete: doDelete } = parseArgs();
  if (!project) {
    console.error('Usage: node scripts/cleanup_object_object_threads.mjs --project <project> [--dry-run|--hide|--delete]');
    process.exit(1);
  }

  const cred = loadServiceAccount();
  if (!admin.apps.length) {
    if (cred) {
      admin.initializeApp({
        credential: admin.credential.cert(cred),
        projectId: project,
      });
    } else {
      try {
        admin.initializeApp({ projectId: project });
        console.log('Using Application Default Credentials (no service account key).');
      } catch (e) {
        console.error(
          'Missing Firebase credentials. Use one of:\n' +
            '  - GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json\n' +
            '  - FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/key.json\n' +
            '  - serviceAccountKey.json in functions/ or project root\n' +
            '  - gcloud auth application-default login (then run again)'
        );
        process.exit(1);
      }
    }
  }
  const db = admin.firestore();

  console.log(`Mode: ${dryRun ? 'dry-run' : hide ? 'hide' : 'delete'}`);
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
      if (isInvalidThreadId(d.id)) invalid.push({ id: d.id, ref: d.ref });
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < limit) break;
  }

  console.log(`Found ${invalid.length} invalid thread(s).`);
  invalid.forEach(({ id }) => console.log(`  - ${id}`));

  if (invalid.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (dryRun) {
    console.log('Dry-run: no changes. Use --hide or --delete to apply.');
    return;
  }

  if (hide) {
    const batch = db.batch();
    invalid.forEach(({ ref }) => {
      batch.update(ref, { hidden: true, archived: true });
    });
    await batch.commit();
    console.log(`Updated ${invalid.length} thread(s) with hidden=true, archived=true.`);
    return;
  }

  if (doDelete) {
    for (const { id, ref } of invalid) {
      const msgsRef = ref.collection('messages');
      const total = await deleteCollection(msgsRef, 400);
      await ref.delete();
      console.log(`Deleted thread ${id} and ${total} message(s).`);
    }
    console.log(`Deleted ${invalid.length} invalid thread(s).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
