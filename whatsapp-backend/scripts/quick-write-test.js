#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');

const sha1 = (value) => crypto.createHash('sha1').update(String(value)).digest('hex');
const shortHash = (value) => sha1(value).slice(0, 8);

const readPortFromEnvFile = () => {
  const envPath = '/etc/whatsapp-backend/env';
  try {
    if (!fs.existsSync(envPath)) return null;
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^PORT=(.+)$/m);
    if (!match) return null;
    const port = Number(match[1].trim());
    return Number.isFinite(port) ? port : null;
  } catch {
    return null;
  }
};

const buildBaseUrl = () => {
  if (process.env.WHATSAPP_BACKEND_URL) return process.env.WHATSAPP_BACKEND_URL;
  const envPort = process.env.PORT ? Number(process.env.PORT) : null;
  const port = Number.isFinite(envPort) ? envPort : readPortFromEnvFile() || 8080;
  return `http://127.0.0.1:${port}`;
};

const jsonFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
};

const normalizeJid = (value) => {
  if (!value) return null;
  if (value.includes('@')) return value;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
};

const pickAccount = (accounts) => {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const connected = accounts.find((acc) => acc.status === 'connected');
  return connected || accounts[0];
};

const pickDestJid = async ({ baseUrl, account, accountId }) => {
  if (process.env.DEST_JID) return normalizeJid(process.env.DEST_JID);
  const waJid = account?.waJid || account?.jid || null;
  const phoneJid = normalizeJid(account?.phone || null);
  if (waJid || phoneJid) return normalizeJid(waJid || phoneJid);

  const threadsRes = await jsonFetch(`${baseUrl}/api/whatsapp/threads/${accountId}`);
  const threads = Array.isArray(threadsRes?.data?.threads)
    ? threadsRes.data.threads
    : Array.isArray(threadsRes?.data)
      ? threadsRes.data
      : [];
  const thread = threads[0] || {};
  const clientJid = thread.clientJid || thread.jid || thread.remoteJid || null;
  return normalizeJid(clientJid);
};

const findThreadHash = async ({ baseUrl, accountId, destJid }) => {
  if (!destJid) return null;
  const threadsRes = await jsonFetch(`${baseUrl}/api/whatsapp/threads/${accountId}`);
  const threads = Array.isArray(threadsRes?.data?.threads)
    ? threadsRes.data.threads
    : Array.isArray(threadsRes?.data)
      ? threadsRes.data
      : [];
  const match = threads.find(
    (thread) =>
      thread.clientJid === destJid ||
      thread.jid === destJid ||
      thread.remoteJid === destJid
  );
  const threadId = match?.threadId || match?.id || null;
  return threadId ? shortHash(threadId) : null;
};

(async () => {
  const baseUrl = buildBaseUrl();
  const accountsRes = await jsonFetch(`${baseUrl}/api/whatsapp/accounts`);
  const accounts = accountsRes?.data?.accounts || accountsRes?.data || [];
  const account = pickAccount(accounts);

  if (!account) {
    console.log(JSON.stringify({ sent: false, error: 'no_account' }));
    process.exit(1);
  }

  const accountId = account.accountId || account.id;
  if (!accountId) {
    console.log(JSON.stringify({ sent: false, error: 'missing_account_id' }));
    process.exit(1);
  }

  const destJid = await pickDestJid({ baseUrl, account, accountId });
  if (!destJid) {
    console.log(JSON.stringify({ sent: false, error: 'missing_dest_jid' }));
    process.exit(1);
  }

  const payload = {
    accountId,
    to: destJid,
    message: `dup_test_${Date.now()}`,
  };

  const sendRes = await jsonFetch(`${baseUrl}/api/whatsapp/send-message`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const resp = sendRes?.data || {};
  const messageId = resp.messageId || resp.requestId || resp.clientMessageId || null;
  const threadHash = await findThreadHash({ baseUrl, accountId, destJid });

  console.log(
    JSON.stringify({
      accountHash: shortHash(accountId),
      destHash: shortHash(destJid),
      sent: Boolean(sendRes.ok),
      statusCode: sendRes.status,
      waMessageIdHash: messageId ? shortHash(messageId) : null,
      threadHash,
    })
  );
})();
