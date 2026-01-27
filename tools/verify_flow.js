#!/usr/bin/env node
const fs = require('fs');
const admin = require('firebase-admin');

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8080';
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || '/etc/whatsapp-backend/firebase-sa.json';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDcMXO6XdFZE_tVnJ1M4Wrt8Aw7Yh1o0K0';

if (!admin.apps.length) {
  const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
  const sa = JSON.parse(raw);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return JSON.parse(text);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  return JSON.parse(text);
}

async function getJsonWithStatus(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function normalizePhone(jid) {
  if (typeof jid !== 'string') return '';
  const local = jid.split('@')[0];
  return local.replace(/\D/g, '');
}

function parseTs(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (value && typeof value === 'object') {
    const sec = value._seconds || value.seconds || value.sec;
    if (typeof sec === 'number') return sec * 1000;
  }
  return 0;
}

async function main() {
  const customToken = await admin.auth().createCustomToken('cli-verifier');
  const signIn = await postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { token: customToken, returnSecureToken: true }
  );
  const idToken = signIn.idToken;
  const headers = { Authorization: `Bearer ${idToken}` };

  const accounts = await getJson(`${BACKEND_BASE_URL}/api/whatsapp/accounts`, headers);
  const accList = accounts.accounts || [];
  let accountId = null;
  for (const acc of accList) {
    if (acc.status === 'connected') {
      accountId = acc.id || acc.accountId;
      break;
    }
  }
  if (!accountId && accList.length) {
    accountId = accList[0].id || accList[0].accountId;
  }

  const threads = await getJson(`${BACKEND_BASE_URL}/api/whatsapp/threads/${accountId}`, headers);
  const threadList = threads.threads || [];

  const seen = new Set();
  let duplicates = 0;
  const deduped = [];
  for (const t of threadList) {
    const jid = t.clientJid || '';
    let key = `${accountId}__${normalizePhone(jid)}`;
    if (!key.replace(/_/g, '')) {
      key = `${accountId}__${t.id || ''}`;
    }
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    deduped.push(t);
  }

  const recentThreads = [...threadList]
    .sort((a, b) => parseTs(b.lastMessageAt) - parseTs(a.lastMessageAt))
    .slice(0, 3);

  const messageChecks = [];
  for (const t of recentThreads) {
    const threadId = t.id;
    const msgsResp = await getJsonWithStatus(
      `${BACKEND_BASE_URL}/api/whatsapp/messages/${accountId}/${threadId}?limit=20`,
      headers
    );
    const msgList = msgsResp.body.messages || [];
    const hasInbound = msgList.some((m) => m.fromMe === false || m.direction === 'in');
    const latest = msgList[0] || null;
    let dupOut = 0;
    const seenOut = new Set();
    for (const m of msgList) {
      if (m.fromMe === true || m.direction === 'out' || m.direction === 'outbound') {
        const key = m.clientMessageId || m.requestId;
        if (key) {
          if (seenOut.has(key)) dupOut += 1;
          else seenOut.add(key);
        }
      }
    }
    const sample = msgList[0]
      ? {
          id: msgList[0].id || msgList[0].messageId || null,
          body: msgList[0].body || null,
          tsClient: msgList[0].tsClient || null,
          fromMe: msgList[0].fromMe ?? msgList[0].direction ?? null,
        }
      : null;
    messageChecks.push({
      threadId,
      hasInbound,
      duplicateOutbound: dupOut,
      messagesCount: msgList.length,
      messagesStatus: msgsResp.status,
      messagesError: msgsResp.body.error || null,
      lastMessageAt: t.lastMessageAt,
      lastMessagePreview: t.lastMessagePreview || t.lastMessageText || null,
      latestBody: latest ? latest.body : null,
      latestTsClient: latest ? latest.tsClient : null,
      latestTsServer: latest ? latest.tsServer : null,
      sampleMessage: sample,
    });
  }

  console.log(
    JSON.stringify(
      {
        accountId,
        threadsRaw: threadList.length,
        threadsDeduped: deduped.length,
        threadsDuplicates: duplicates,
        recentThreads: recentThreads.map((t) => ({
          threadId: t.id,
          clientJid: t.clientJid,
          lastMessageAt: t.lastMessageAt,
          lastMessagePreview: t.lastMessagePreview || t.lastMessageText || null,
        })),
        messageChecks,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
