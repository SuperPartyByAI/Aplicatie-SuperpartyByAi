#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const admin = require('firebase-admin');

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return fallback;
  return next;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function usage() {
  return `
Usage:
  node scripts/export-google-sheets.js \\
    --sheetId <SHEET_ID> \\
    --serviceAccount <path-to-service-account.json> \\
    [--projectId <firebase-project-id>] \\
    [--accountId <accountId>] \\
    [--limitThreads 200] [--limitMessages 200] \\
    [--tabContacts Contacts] [--tabThreads Threads] [--tabMessages Messages]

Env fallback:
  GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON for service account
  FIREBASE_PROJECT_ID for projectId
`;
}

function readServiceAccount(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildJwtAssertion(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const toSign = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(toSign)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${toSign}.${signature}`;
}

function requestToken(assertion) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request('https://oauth2.googleapis.com/token', options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const json = JSON.parse(data);
          resolve(json.access_token);
        } else {
          reject(new Error(`Token request failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sheetUpdate({ sheetId, tabName, values, accessToken }) {
  const range = encodeURIComponent(`${tabName}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`;
  const payload = JSON.stringify({ values });
  const options = {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Sheets update failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function toIso(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value._seconds != null) return new Date(value._seconds * 1000).toISOString();
  if (typeof value === 'string') return value;
  return '';
}

async function fetchContacts(db) {
  const snap = await db.collection('contacts').get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      accountId: data.accountId || '',
      phone: data.phone || data.phoneNumber || '',
      displayName: data.displayName || data.name || '',
      photoUrl: data.profilePictureUrl || data.photoUrl || '',
      updatedAt: toIso(data.updatedAt),
    };
  });
}

async function fetchThreads(db, limitThreads) {
  const snap = await db
    .collection('threads')
    .orderBy('lastMessageAt', 'desc')
    .limit(limitThreads)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      accountId: data.accountId || '',
      clientJid: data.clientJid || '',
      displayName: data.displayName || '',
      phone: data.phone || data.phoneE164 || data.phoneNumber || '',
      lastMessageAtMs: data.lastMessageAtMs || '',
      lastMessageAt: toIso(data.lastMessageAt),
      lastMessageText: data.lastMessageText || data.lastMessagePreview || '',
    };
  });
}

async function fetchMessages(db, limitMessages, accountId) {
  try {
    let query = db.collectionGroup('messages').orderBy('createdAt', 'desc');
    if (accountId) query = query.where('accountId', '==', accountId);
    const snap = await query.limit(limitMessages).get();
    return snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        threadId: data.threadId || '',
        accountId: data.accountId || '',
        clientJid: data.clientJid || '',
        direction: data.direction || '',
        body: data.body || '',
        tsClientMs: data.tsClientMs || '',
        tsClientAt: toIso(data.tsClient),
        createdAt: toIso(data.createdAt),
      };
    });
  } catch (err) {
    return [{ id: 'ERROR', threadId: '', accountId: '', clientJid: '', direction: '', body: String(err.message || err), tsClientMs: '', tsClientAt: '', createdAt: '' }];
  }
}

async function main() {
  const sheetId = readArg('--sheetId') || process.env.GOOGLE_SHEET_ID;
  const serviceAccountPath =
    readArg('--serviceAccount') ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId =
    readArg('--projectId') || process.env.FIREBASE_PROJECT_ID || 'superparty-frontend';
  const accountId = readArg('--accountId');
  const limitThreads = asNumber(readArg('--limitThreads'), 200);
  const limitMessages = asNumber(readArg('--limitMessages'), 200);
  const tabContacts = readArg('--tabContacts', 'Contacts');
  const tabThreads = readArg('--tabThreads', 'Threads');
  const tabMessages = readArg('--tabMessages', 'Messages');

  if (!sheetId || !serviceAccountPath) {
    console.error(usage());
    process.exit(1);
  }

  const resolvedPath = path.resolve(serviceAccountPath);
  const serviceAccount = readServiceAccount(resolvedPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }
  const db = admin.firestore();

  const assertion = buildJwtAssertion(
    serviceAccount,
    'https://www.googleapis.com/auth/spreadsheets'
  );
  const accessToken = await requestToken(assertion);

  const contacts = await fetchContacts(db);
  const threads = await fetchThreads(db, limitThreads);
  const messages = await fetchMessages(db, limitMessages, accountId);

  await sheetUpdate({
    sheetId,
    tabName: tabContacts,
    accessToken,
    values: [
      ['id', 'accountId', 'phone', 'displayName', 'photoUrl', 'updatedAt'],
      ...contacts.map((c) => [
        c.id,
        c.accountId,
        c.phone,
        c.displayName,
        c.photoUrl,
        c.updatedAt,
      ]),
    ],
  });

  await sheetUpdate({
    sheetId,
    tabName: tabThreads,
    accessToken,
    values: [
      [
        'id',
        'accountId',
        'clientJid',
        'displayName',
        'phone',
        'lastMessageAtMs',
        'lastMessageAt',
        'lastMessageText',
      ],
      ...threads.map((t) => [
        t.id,
        t.accountId,
        t.clientJid,
        t.displayName,
        t.phone,
        t.lastMessageAtMs,
        t.lastMessageAt,
        t.lastMessageText,
      ]),
    ],
  });

  await sheetUpdate({
    sheetId,
    tabName: tabMessages,
    accessToken,
    values: [
      [
        'id',
        'threadId',
        'accountId',
        'clientJid',
        'direction',
        'body',
        'tsClientMs',
        'tsClientAt',
        'createdAt',
      ],
      ...messages.map((m) => [
        m.id,
        m.threadId,
        m.accountId,
        m.clientJid,
        m.direction,
        m.body,
        m.tsClientMs,
        m.tsClientAt,
        m.createdAt,
      ]),
    ],
  });

  console.log('✅ Export completed');
  console.log(`Contacts: ${contacts.length}`);
  console.log(`Threads: ${threads.length}`);
  console.log(`Messages: ${messages.length}`);
}

main().catch((err) => {
  console.error('❌ Export failed:', err.message || err);
  process.exit(1);
});
