#!/usr/bin/env node
/**
 * Revoke admin for a user: remove custom claim admin, set users/{uid}.role to "user",
 * optionally keep staffProfiles with role "staff" (or delete if --deleteStaffProfile).
 *
 * Usage:
 *   node scripts/revoke_admin.mjs --project <ID> --email <EMAIL>
 *   node scripts/revoke_admin.mjs --project <ID> --uid <UID>
 *   node scripts/revoke_admin.mjs --project <ID> --email <EMAIL> --deleteStaffProfile
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
  const cwd = path.resolve(__dirname, '..');
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
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json', 'serviceAccountKey.json']) {
    const v = tryPath(path.join(cwd, rel));
    if (v) return { serviceAccount: v };
  }
  const up = path.join(cwd, '..');
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json']) {
    const v = tryPath(path.join(up, rel));
    if (v) return { serviceAccount: v };
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null, uid: null, email: null, deleteStaffProfile: false };
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Usage: node scripts/revoke_admin.mjs --project <ID> (--uid <UID> | --email <EMAIL>) [--deleteStaffProfile]

  --project           Firebase project ID (required)
  --uid               User UID
  --email             User email (resolved to UID)
  --deleteStaffProfile  Delete staffProfiles doc; otherwise keep with role=staff

  Removes custom claim admin, sets users/{uid}.role = "user". User must re-login.
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--uid' && args[i + 1]) { out.uid = args[++i]; continue; }
    if (args[i] === '--email' && args[i + 1]) { out.email = args[++i]; continue; }
    if (args[i] === '--deleteStaffProfile') { out.deleteStaffProfile = true; continue; }
  }
  return out;
}

async function main() {
  const { project, uid, email, deleteStaffProfile } = parseArgs();
  if (!project) {
    console.error('Missing --project');
    process.exit(1);
  }
  if (!uid && !email) {
    console.error('Provide --uid or --email');
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

  const changes = [];

  try {
    await auth.setCustomUserClaims(targetUid, { admin: false });
    changes.push('Custom claim admin set to false');
  } catch (e) {
    console.warn('Could not set custom claim:', e.message);
  }

  await db.collection('users').doc(targetUid).set(
    { role: 'user', email: targetEmail ?? null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  changes.push('users/' + targetUid + '.role = "user"');

  const staffRef = db.collection('staffProfiles').doc(targetUid);
  const staffSnap = await staffRef.get();
  if (deleteStaffProfile && staffSnap.exists) {
    await staffRef.delete();
    changes.push('staffProfiles/' + targetUid + ' deleted');
  } else if (staffSnap.exists) {
    await staffRef.update({
      role: 'staff',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    changes.push('staffProfiles/' + targetUid + ' kept with role=staff');
  }

  console.log('Revoked admin. Changes:');
  changes.forEach((c) => console.log('  -', c));
  console.log('User must re-login.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
