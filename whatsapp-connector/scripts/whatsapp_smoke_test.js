#!/usr/bin/env node
/**
 * E2E smoke test for WhatsApp connector.
 *
 * Required env:
 * - CONNECTOR_BASE_URL=https://<railway-domain>
 * - SUPER_ADMIN_ID_TOKEN=...
 * - EMPLOYEE_ID_TOKEN=...
 * - NON_OWNER_ID_TOKEN=...
 * - FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'  (for Firestore verification)
 * - FIREBASE_PROJECT_ID=... (optional if present in service account)
 */

const admin = require('firebase-admin');

function mustEnv(name) {
  const v = (process.env[name] || '').toString().trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpJson({ method, url, token, body }) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { status: res.status, ok: res.ok, json, text };
}

function initAdmin() {
  const saJson = mustEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
  let cred;
  try {
    cred = JSON.parse(saJson);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON');
  }
  const projectId = (process.env.FIREBASE_PROJECT_ID || '').toString().trim() || cred.project_id;
  if (!projectId) throw new Error('Missing FIREBASE_PROJECT_ID (or project_id in service account).');

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId,
    });
  }
  return admin.firestore();
}

async function waitForDoc(ref, { timeoutMs = 15_000, stepMs = 500 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await ref.get();
    if (snap.exists) return snap;
    if (Date.now() - start > timeoutMs) return null;
    await sleep(stepMs);
  }
}

async function main() {
  const base = mustEnv('CONNECTOR_BASE_URL').replace(/\/+$/, '');
  const superToken = mustEnv('SUPER_ADMIN_ID_TOKEN');
  const employeeToken = mustEnv('EMPLOYEE_ID_TOKEN');
  const nonOwnerToken = mustEnv('NON_OWNER_ID_TOKEN');

  const db = initAdmin();

  // 1) /health
  const health = await httpJson({ method: 'GET', url: `${base}/health` });
  if (!health.ok || !health.json?.ok) throw new Error(`Health failed: ${health.status} ${health.text}`);
  console.log('[OK] health', { healthy: health.json.healthy, version: health.json.version, gitSha: health.json.gitSha });

  // 2) create account (super-admin)
  const create = await httpJson({
    method: 'POST',
    url: `${base}/api/accounts`,
    token: superToken,
    body: { name: `Smoke ${Date.now()}`, phone: '+40' },
  });
  if (!create.ok || !create.json?.accountId) throw new Error(`Create account failed: ${create.status} ${create.text}`);
  const accountId = create.json.accountId;
  console.log('[OK] created account', { accountId });

  // 3) verify Firestore docs exist (public + private)
  const accRef = db.collection('whatsapp_accounts').doc(accountId);
  const acc = await waitForDoc(accRef);
  if (!acc) throw new Error('Account doc not found in Firestore');
  const priv = await waitForDoc(accRef.collection('private').doc('state'));
  if (!priv) throw new Error('Account private/state doc not found in Firestore');
  console.log('[OK] firestore account docs exist');

  // 4) send as owner (employee) -> should enqueue outbox and create placeholder message
  const threadId = `${accountId}_testchat@s.whatsapp.net`;
  const sendOwner = await httpJson({
    method: 'POST',
    url: `${base}/api/send`,
    token: employeeToken,
    body: {
      threadId,
      accountId,
      chatId: 'testchat@s.whatsapp.net',
      to: 'testchat@s.whatsapp.net',
      text: `smoke ping ${Date.now()}`,
      clientMessageId: `cli_${Date.now()}`,
    },
  });
  if (!sendOwner.ok || !sendOwner.json?.commandId) throw new Error(`Owner send failed: ${sendOwner.status} ${sendOwner.text}`);
  const commandId = sendOwner.json.commandId;
  console.log('[OK] owner send enqueued', { commandId });

  const outbox = await waitForDoc(db.collection('whatsapp_outbox').doc(commandId));
  if (!outbox) throw new Error('Outbox doc not found (expected server write)');
  const msg = await waitForDoc(db.collection('whatsapp_messages').doc(commandId));
  if (!msg) throw new Error('Placeholder message doc not found');
  console.log('[OK] firestore outbox + placeholder message exist');

  // 5) send as non-owner (denied)
  const sendNonOwner = await httpJson({
    method: 'POST',
    url: `${base}/api/send`,
    token: nonOwnerToken,
    body: {
      threadId,
      accountId,
      chatId: 'testchat@s.whatsapp.net',
      to: 'testchat@s.whatsapp.net',
      text: `should be denied ${Date.now()}`,
      clientMessageId: `cli_${Date.now()}_x`,
    },
  });
  if (sendNonOwner.status !== 403) throw new Error(`Expected 403 for non-owner, got ${sendNonOwner.status}: ${sendNonOwner.text}`);
  console.log('[OK] non-owner denied', { error: sendNonOwner.json?.error });

  console.log('PASS');
}

main().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});

