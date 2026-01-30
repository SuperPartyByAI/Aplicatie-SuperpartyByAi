#!/usr/bin/env node
/**
 * Provision a user as employee-only (no admin).
 * Creates staffProfiles/{uid} with role='staff'. Does NOT set claim admin or users.role='admin'.
 * Use for employees who should see only Inbox Angajați.
 *
 * Usage:
 *   node scripts/provision_employee_only.mjs --project <ID> --email <EMAIL>
 *   node scripts/provision_employee_only.mjs --project <ID> --uid <UID>
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  if (gac) { const v = tryPath(gac); if (v) return { serviceAccount: v }; }
  const fpath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fpath) { const v = tryPath(fpath); if (v) return { serviceAccount: v }; }
  const fjson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fjson) {
    const s = fjson.trim();
    const v = (s.startsWith('{') || s.startsWith('[')) ? tryJson(s) : tryPath(s);
    if (v) return { serviceAccount: v };
  }
  const projRoot = path.resolve(__dirname, '..');
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json', 'serviceAccountKey.json']) {
    const v = tryPath(path.join(projRoot, rel));
    if (v) return { serviceAccount: v };
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null, uid: null, email: null };
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Usage: node scripts/provision_employee_only.mjs --project <ID> (--uid <UID> | --email <EMAIL>)

  Creates staffProfiles/{uid} with role='staff'. No admin claim, no users.role='admin'.
  Credentials: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--uid' && args[i + 1]) { out.uid = args[++i]; continue; }
    if (args[i] === '--email' && args[i + 1]) { out.email = args[++i]; continue; }
  }
  return out;
}

async function main() {
  const { project, uid, email } = parseArgs();
  if (!project) {
    console.error('Missing --project (e.g. --project superparty-frontend)');
    process.exit(1);
  }
  if (!uid && !email) {
    console.error('Provide --uid <UID> or --email <EMAIL>');
    process.exit(1);
  }

  const loaded = loadServiceAccount();
  try {
    if (loaded) {
      admin.initializeApp({ credential: admin.credential.cert(loaded.serviceAccount), projectId: project });
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: project });
    }
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
    console.error('Use GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login.');
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let targetUid = uid;
  let targetEmail = email;
  if (!targetUid && email) {
    try {
      const u = await auth.getUserByEmail(email);
      targetUid = u.uid;
      targetEmail = u.email || email;
      console.log(`Resolved email to uid=${targetUid}`);
    } catch (e) {
      console.error('User not found for email:', email, e.message);
      process.exit(1);
    }
  } else if (targetUid && !targetEmail) {
    try {
      const u = await auth.getUser(targetUid);
      targetEmail = u.email || null;
    } catch (_) {}
  }

  const ref = db.collection('staffProfiles').doc(targetUid);
  const snap = await ref.get();
  const data = {
    uid: targetUid,
    email: targetEmail ?? null,
    role: 'staff',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!snap.exists) {
    data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(data);
    console.log('staffProfiles/%s created with role=staff (employee-only)', targetUid);
  } else {
    await ref.update(data);
    console.log('staffProfiles/%s updated role=staff (employee-only)', targetUid);
  }

  console.log('Done. User should re-login. They will see only Inbox Angajați (no admin inbox).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
