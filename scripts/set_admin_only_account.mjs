#!/usr/bin/env node
/**
 * Resolve accountId(s) for admin phone (default 0737571397), write config/whatsapp_inbox.adminOnlyAccountIds.
 * Firestore rules use this to block employees from reading admin-only threads.
 *
 * Usage:
 *   node scripts/set_admin_only_account.mjs --project superparty-frontend
 *   node scripts/set_admin_only_account.mjs --project superparty-frontend --phone 0737571397
 *
 * Reads Firestore collection "accounts"; matches phone (phoneE164, phone). Writes config/whatsapp_inbox.
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const ADMIN_PHONE = '0737571397';

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
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) { const v = tryPath(gac); if (v) return { serviceAccount: v }; }
  const fpath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fpath) { const v = tryPath(fpath); if (v) return { serviceAccount: v }; }
  for (const rel of ['functions/serviceAccountKey.json', 'whatsapp-backend/serviceAccountKey.json', 'serviceAccountKey.json']) {
    const v = tryPath(path.join(cwd, rel));
    if (v) return { serviceAccount: v };
  }
  return null;
}

function normalizePhone(input) {
  if (!input || typeof input !== 'string') return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('0') && digits.length === 10) return '4' + digits;
  if (digits.startsWith('40') && digits.length === 11) return digits;
  if (digits.startsWith('4') && digits.length === 11) return digits;
  return digits;
}

function isAdminPhone(phone) {
  const n = normalizePhone(phone);
  const a = normalizePhone(ADMIN_PHONE);
  if (!n || !a) return false;
  if (n === a) return true;
  if (a.length >= 9 && n.length >= 9) return n.slice(-9) === a.slice(-9);
  return false;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null, phone: ADMIN_PHONE };
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Usage: node scripts/set_admin_only_account.mjs --project <ID> [--phone <PHONE>]

  --project  Firebase project ID (required)
  --phone    Admin phone (default ${ADMIN_PHONE})

  Resolves accountId(s) from Firestore "accounts" matching phone, writes config/whatsapp_inbox.adminOnlyAccountIds.
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
    if (args[i] === '--phone' && args[i + 1]) { out.phone = args[++i]; continue; }
  }
  return out;
}

async function main() {
  const { project, phone } = parseArgs();
  if (!project) {
    console.error('Missing --project');
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

  const db = admin.firestore();
  const targetNorm = normalizePhone(phone);
  const snapshot = await db.collection('accounts').get();
  const adminIds = [];
  for (const doc of snapshot.docs) {
    const d = doc.data();
    const ph = d.phoneE164 || d.phone || d.phoneNumber || '';
    const n = normalizePhone(ph);
    const match = n && targetNorm && (n === targetNorm || (n.length >= 9 && targetNorm.length >= 9 && n.slice(-9) === targetNorm.slice(-9)));
    if (match) {
      adminIds.push(doc.id);
      console.log(`Matched account: id=${doc.id}, phone=${ph}`);
    }
  }

  if (adminIds.length === 0) {
    console.warn(`No account found for phone ${phone}. config/whatsapp_inbox will have adminOnlyAccountIds: [].`);
  }

  const ref = db.collection('config').doc('whatsapp_inbox');
  await ref.set({
    adminOnlyAccountIds: adminIds,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminPhone: phone,
  }, { merge: true });

  console.log('Wrote config/whatsapp_inbox.adminOnlyAccountIds:', adminIds);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
