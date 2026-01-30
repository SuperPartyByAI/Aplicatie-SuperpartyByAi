#!/usr/bin/env node
/**
 * Set admin and/or employee (staffProfiles) for a user.
 * Uses firebase-admin; credentials: GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_*,
 * or functions/serviceAccountKey.json / whatsapp-backend/serviceAccountKey.json.
 *
 * Admin: only ADMIN_EMAIL (see _config.mjs) unless --force. Otherwise exit 1 with clear message.
 *
 * Usage:
 *   node scripts/set_admin_claims.mjs --project superparty-frontend --uid <UID> --admin --employee
 *   node scripts/set_admin_claims.mjs --project superparty-frontend --email <EMAIL> --admin --employee
 *   node scripts/set_admin_claims.mjs --project superparty-frontend --email <EMAIL> --admin --force
 *
 * --admin: set custom claim { admin: true } and users/{uid}.role = 'admin'
 * --employee: ensure staffProfiles/{uid} exists (role 'admin' if admin, else 'staff')
 * --force: allow setting admin for email != ADMIN_EMAIL (use with care)
 *
 * User must re-login / refresh token after setting claims.
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ADMIN_EMAIL } from './_config.mjs';

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
  const out = { project: null, uid: null, email: null, admin: false, employee: false, force: false };
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Usage: node scripts/set_admin_claims.mjs --project <ID> (--uid <UID> | --email <EMAIL>) [--admin] [--employee] [--force]

  --project   Firebase project ID (required)
  --uid       User UID
  --email     User email (resolved to UID)
  --admin     Set users/{uid}.role=admin + custom claim admin=true
  --employee  Ensure staffProfiles/{uid} exists (role admin or staff)
  --force     Allow setting admin for email != ${ADMIN_EMAIL}

  Admin can be set only for ${ADMIN_EMAIL} unless --force. Refuses otherwise (exit 1).
  At least one of --admin or --employee required.
  Credentials: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--uid' && args[i + 1]) { out.uid = args[++i]; continue; }
    if (args[i] === '--email' && args[i + 1]) { out.email = args[++i]; continue; }
    if (args[i] === '--admin') { out.admin = true; continue; }
    if (args[i] === '--employee') { out.employee = true; continue; }
    if (args[i] === '--force') { out.force = true; continue; }
  }
  return out;
}

async function main() {
  const { project, uid, email, admin: doAdmin, employee: doEmployee, force } = parseArgs();
  if (!project) {
    console.error('Missing --project (e.g. --project superparty-frontend)');
    process.exit(1);
  }
  if (!uid && !email) {
    console.error('Provide --uid <UID> or --email <EMAIL>');
    process.exit(1);
  }
  if (!doAdmin && !doEmployee) {
    console.error('Provide at least one of --admin or --employee');
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

  let doAdminActual = doAdmin;
  if (doAdmin) {
    const e = (targetEmail || '').trim().toLowerCase();
    const allowed = e === ADMIN_EMAIL.toLowerCase() || force;
    if (!allowed) {
      console.error(`Refused: admin can only be set for ${ADMIN_EMAIL}. Use --employee for other users, or --force to override.`);
      process.exit(1);
    }
  }

  if (doAdminActual) {
    await db.collection('users').doc(targetUid).set(
      { role: 'admin', email: targetEmail ?? null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log('users/%s.role = "admin"', targetUid);
    try {
      await auth.setCustomUserClaims(targetUid, { admin: true });
      console.log('Custom claim admin=true set');
    } catch (e) {
      console.warn('Could not set custom claim:', e.message);
    }
  }

  if (doEmployee) {
    const ref = db.collection('staffProfiles').doc(targetUid);
    const snap = await ref.get();
    const role = doAdminActual ? 'admin' : 'staff';
    const data = {
      uid: targetUid,
      email: targetEmail ?? null,
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!snap.exists) {
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await ref.set(data);
      console.log(`staffProfiles/%s created with role=${role}`, targetUid);
    } else {
      await ref.update(data);
      console.log(`staffProfiles/%s updated role=${role}`, targetUid);
    }
  }

  console.log('Done. User should re-login or refresh token.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
