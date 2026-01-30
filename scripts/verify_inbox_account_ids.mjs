#!/usr/bin/env node
/**
 * Verify Inbox Angajați: accountIds from API/Firestore vs threads query.
 *
 * 1. Lists Firestore `accounts` (source for GET /api/whatsapp/accounts).
 * 2. For each accountId, runs the same threads query as Staff Inbox (accountId + orderBy lastMessageAt).
 * 3. Marks admin phone (0737571397) – excluded in Staff Inbox.
 * 4. Reports thread counts so we can confirm API accountIds match thread accountIds.
 *
 * Usage:
 *   node scripts/verify_inbox_account_ids.mjs --project superparty-frontend
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/verify_inbox_account_ids.mjs --project superparty-frontend
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

function maskPhone(p) {
  if (!p || typeof p !== 'string') return '?';
  const d = p.replace(/\D/g, '');
  if (d.length < 4) return '****';
  return '*' + d.slice(-4);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { project: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) { out.project = args[++i]; continue; }
  }
  return out;
}

function threadsQuery(db, accountId) {
  return db.collection('threads')
    .where('accountId', '==', accountId)
    .orderBy('lastMessageAt', 'desc')
    .limit(200);
}

async function main() {
  const { project } = parseArgs();
  if (!project) {
    console.error('❌ Missing --project (e.g. --project superparty-frontend)');
    process.exit(1);
  }

  const loaded = loadServiceAccount();
  try {
    if (loaded && loaded.serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(loaded.serviceAccount),
        projectId: project,
      });
    } else {
      admin.initializeApp({ projectId: project });
    }
  } catch (e) {
    console.error('❌ Firebase init failed:', e.message);
    console.error('   Use GOOGLE_APPLICATION_CREDENTIALS or serviceAccountKey.json. See audit_whatsapp_inbox_schema.mjs.');
    process.exit(1);
  }

  const db = admin.firestore();

  console.log('🔍 Verify Inbox Angajați – accountIds vs threads');
  console.log('─'.repeat(60));
  console.log(`   Project: ${project}`);
  console.log(`   Admin phone (excluded in Staff Inbox): ${ADMIN_PHONE}`);
  console.log('');

  // 1. List accounts (same source as GET /api/whatsapp/accounts)
  const accountsSnap = await db.collection('accounts').get();
  const accounts = [];
  for (const doc of accountsSnap.docs) {
    const d = doc.data();
    const accountId = doc.id;
    const status = d.status || 'unknown';
    if (status === 'deleted') continue;
    const phone = d.phoneE164 || d.phone || null;
    const name = d.name || accountId;
    accounts.push({ accountId, phone, status, name });
  }

  console.log(`📋 Firestore accounts (source for API): ${accounts.length}`);
  if (accounts.length === 0) {
    console.log('   No accounts. Staff Inbox would have 0 accountIds → 0 threads.');
    process.exit(0);
  }

  const staffAccountIds = [];
  const results = [];

  for (const a of accounts) {
    const adminExcluded = isAdminPhone(a.phone);
    if (!adminExcluded) staffAccountIds.push(a.accountId);

    let threadCount = 0;
    let queryError = null;
    try {
      const snap = await threadsQuery(db, a.accountId).get();
      threadCount = snap.size;
    } catch (e) {
      queryError = e.message;
      const code = e.code || e.status || '';
      if (String(code).includes('failed-precondition') || code === 9) queryError += ' (missing index?)';
      if (String(code).includes('permission-denied') || code === 7) queryError += ' (rules?)';
    }

    results.push({
      accountId: a.accountId,
      phone: maskPhone(a.phone),
      status: a.status,
      threadCount,
      queryError,
      adminExcluded,
    });
  }

  // Print per-account
  for (const r of results) {
    const badge = r.adminExcluded ? ' [ADMIN – excluded in Staff Inbox]' : '';
    const err = r.queryError ? `  ⚠️ query error: ${r.queryError}` : '';
    console.log(`   ${r.accountId}  phone=…${r.phone}  status=${r.status}  threads=${r.threadCount}${badge}${err}`);
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log('Staff Inbox (getAccountsStaff → excludes admin phone):');
  console.log(`   AccountIds queried for threads: ${staffAccountIds.length > 0 ? staffAccountIds.join(', ') : '(none)'}`);
  if (staffAccountIds.length === 0) {
    console.log('   → No non-admin accounts. Inbox would show 0 conversations.');
  } else {
    const totalStaff = results.filter((r) => !r.adminExcluded).reduce((s, r) => s + (r.queryError ? 0 : r.threadCount), 0);
    console.log(`   → Total threads across these accounts: ${totalStaff}`);
    const withErr = results.filter((r) => !r.adminExcluded && r.queryError);
    if (withErr.length > 0) {
      console.log(`   ⚠️ ${withErr.length} account(s) had query errors – fix index/rules.`);
    }
  }

  console.log('');
  console.log('✅ Same accountIds used for: API response, Firestore threads query, thread doc field "accountId".');
  console.log('   If thread count = 0 for an account, create threads via re-pair (Disconnect → Connect → Scan QR) or new messages.');
  console.log('   Note: This script uses Admin SDK (bypasses rules). The app uses client SDK – if you see 0 in Inbox but counts >0 here, check Firestore rules (e.g. staffProfiles, adminOnlyAccountIds).');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
