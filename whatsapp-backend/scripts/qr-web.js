#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');
const QRCode = require('qrcode');

const PORT = Number(process.env.QR_WEB_PORT || 8787);
const HOST = '127.0.0.1';
const BASE_URL = process.env.WA_BASE_URL || 'http://127.0.0.1:8080';
const RUNTIME_FILE = process.env.QR_RUNTIME_FILE || '/tmp/wa-qr-runtime.json';
const ALLOW_NO_TOKEN_LOCAL = String(process.env.NO_TOKEN_LOCAL || 'false') === 'true';
const POLL_INTERVAL_MS = Number(process.env.QR_POLL_MS || 3000);
const TARGET_ACCOUNT_ID = String(process.env.QR_ACCOUNT_ID || '').trim();

const normalizeToken = (value) => String(value || '').trim().replace(/\r|\n/g, '');
const hash8 = (value) =>
  value ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 8) : null;

const state = {
  connected: false,
  accountId: null,
  accountStatus: null,
  accountsTotal: 0,
  noAccounts: false,
  hasQr: false,
  qrDataUrl: null,
  qrUpdatedAt: null,
  qrSeq: 0,
  qrHash8: null,
  lastQrString: null,
  connectedAt: null,
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderHtml = () => {
  const connected = state.connected;
  const statusText = connected ? 'CONNECTED' : (state.accountStatus || 'NOT CONNECTED');
  const refreshScript = connected
    ? ''
    : '<script>setTimeout(() => window.location.reload(), 8000);</script>';

  let body = '<h2>Status: ' + escapeHtml(statusText) + '</h2>';
  if (connected) {
    const connectedAt = state.connectedAt ? escapeHtml(state.connectedAt) : 'unknown';
    body += '<p>Device is connected. Connected at ' + connectedAt + '.</p>';
    body += '<button onclick="window.close()">Close</button>';
  } else if (state.qrDataUrl) {
    body += '<p>Scan this QR with WhatsApp -> Linked devices.</p>';
    body += '<img src="' + state.qrDataUrl + '" alt="WhatsApp QR" />';
  } else {
    body += '<p>Waiting for QR...</p>';
  }

  return '<!doctype html>\n'
    + '<html>\n'
    + '  <head>\n'
    + '    <meta charset="utf-8" />\n'
    + '    <title>WhatsApp QR Diagnostics</title>\n'
    + '    <style>\n'
    + '      body { font-family: Arial, sans-serif; padding: 16px; }\n'
    + '      img { max-width: 320px; height: auto; border: 1px solid #ddd; }\n'
    + '    </style>\n'
    + '  </head>\n'
    + '  <body>\n'
    + '    ' + body + '\n'
    + '    ' + refreshScript + '\n'
    + '  </body>\n'
    + '</html>';
};

const isLocalRequest = (req) => {
  const remote = String(req.socket && req.socket.remoteAddress || '');
  const host = String(req.headers.host || '');
  return (
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote.endsWith('127.0.0.1') ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1')
  );
};

const readExpectedToken = () => {
  try {
    const raw = fs.readFileSync(RUNTIME_FILE, 'utf8');
    const json = JSON.parse(raw);
    return normalizeToken(json.token || '');
  } catch (err) {
    return normalizeToken(process.env.DIAG_TOKEN || '');
  }
};

const getProvidedToken = (req) => {
  const parsed = url.parse(req.url || '', true);
  const queryToken = normalizeToken(parsed.query.token);
  const authHeader = normalizeToken(req.headers.authorization || '');
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? normalizeToken(authHeader.slice(7))
    : '';
  return queryToken || bearer;
};

const validateToken = (req) => {
  const expected = readExpectedToken();
  const provided = getProvidedToken(req);

  if (!provided && ALLOW_NO_TOKEN_LOCAL && isLocalRequest(req)) {
    return { ok: true, usedLocalBypass: true };
  }

  return {
    ok: Boolean(provided && expected && provided === expected),
    expectedSha8: hash8(expected),
    expectedLen: expected.length,
    gotSha8: hash8(provided),
    gotLen: provided.length,
  };
};

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const setNoCache = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const requestJson = (urlString) => {
  const target = new URL(urlString);
  const lib = target.protocol === 'https:' ? https : http;
  const options = {
    method: 'GET',
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body: data });
      });
    });

    req.on('error', reject);
    req.end();
  });
};

let pollTimer = null;

const selectAccount = (accounts) => {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return null;
  }

  if (TARGET_ACCOUNT_ID) {
    const byId = accounts.find((a) => a && a.id === TARGET_ACCOUNT_ID);
    if (byId) {
      return byId;
    }
  }

  const hasQr = accounts.find((a) => a && typeof a.qrCode === 'string' && a.qrCode);
  if (hasQr) {
    return hasQr;
  }

  const preferredStatuses = ['needs_qr', 'qr_ready', 'connecting'];
  for (const status of preferredStatuses) {
    const found = accounts.find((a) => a && a.status === status);
    if (found) {
      return found;
    }
  }

  return accounts[0];
};

const updateQrData = async (qrValue) => {
  state.hasQr = Boolean(qrValue);
  if (!qrValue) {
    state.qrDataUrl = null;
    return;
  }
  state.lastQrString = qrValue;
  if (qrValue.startsWith('data:image/')) {
    state.qrDataUrl = qrValue;
  } else {
    try {
      state.qrDataUrl = await QRCode.toDataURL(qrValue);
    } catch {
      state.qrDataUrl = null;
    }
  }
  state.qrUpdatedAt = new Date().toISOString();
  state.qrSeq += 1;
  state.qrHash8 = hash8(qrValue);
};

const pollBackend = async () => {
  try {
    const accountsRes = await requestJson(BASE_URL + '/api/whatsapp/accounts');
    if (accountsRes.statusCode < 200 || accountsRes.statusCode >= 300) {
      return;
    }
    let data = {};
    try { data = JSON.parse(accountsRes.body); } catch (_) { data = {}; }

    const accounts = data.accounts || [];
    state.accountsTotal = accounts.length;
    state.noAccounts = accounts.length === 0;

    if (state.noAccounts) {
      state.hasQr = false;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      return;
    }

    const account = selectAccount(accounts);
    state.accountId = account && account.id || null;
    state.accountStatus = account && account.status || null;
    state.connected = String(state.accountStatus || '').toLowerCase() === 'connected';

    if (state.connected) {
      state.qrDataUrl = null;
      state.hasQr = false;
      if (!state.connectedAt) {
        state.connectedAt = new Date().toISOString();
      }
      return;
    }

    let qrValue = account && account.qrCode || null;
    if (!qrValue && state.accountId) {
      const qrRes = await requestJson(BASE_URL + '/api/whatsapp/qr/' + state.accountId);
      if (qrRes.statusCode >= 200 && qrRes.statusCode < 300) {
        let qrPayload = {};
        try { qrPayload = JSON.parse(qrRes.body); } catch (_) { qrPayload = {}; }
        qrValue = qrPayload.qrCode || qrPayload.qr || null;
      }
    }

    await updateQrData(qrValue);
  } catch {
    // swallow
  }
};

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/status')) {
    const auth = validateToken(req);
    if (!auth.ok) {
      console.warn(
        'unauthorized expected_sha8=' + (auth.expectedSha8 || 'null')
          + ' expected_len=' + (auth.expectedLen || 0)
          + ' got_sha8=' + (auth.gotSha8 || 'null')
          + ' got_len=' + (auth.gotLen || 0)
      );
      sendJson(res, 401, {
        error: 'unauthorized',
        expectedSha8: auth.expectedSha8 || null,
        gotSha8: auth.gotSha8 || null,
        expectedLen: auth.expectedLen || 0,
        gotLen: auth.gotLen || 0,
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      accounts_total: state.accountsTotal,
      has_qr: state.hasQr,
      status: state.noAccounts ? 'no_accounts' : (state.hasQr ? 'qr_ready' : 'waiting_for_qr'),
    });
    return;
  }
  if (req.url && req.url.startsWith('/qr')) {
    const auth = validateToken(req);
    if (!auth.ok) {
      console.warn(
        'unauthorized expected_sha8=' + (auth.expectedSha8 || 'null')
          + ' expected_len=' + (auth.expectedLen || 0)
          + ' got_sha8=' + (auth.gotSha8 || 'null')
          + ' got_len=' + (auth.gotLen || 0)
      );
      sendJson(res, 401, {
        error: 'unauthorized',
        expectedSha8: auth.expectedSha8 || null,
        gotSha8: auth.gotSha8 || null,
        expectedLen: auth.expectedLen || 0,
        gotLen: auth.gotLen || 0,
      });
      return;
    }

    if (state.noAccounts) {
      sendJson(res, 200, {
        ok: true,
        status: 'no_accounts',
        accounts_total: 0,
      });
      return;
    }

    if (!state.hasQr) {
      sendJson(res, 200, {
        ok: true,
        status: 'waiting_for_qr',
        accounts_total: state.accountsTotal,
      });
      return;
    }

    const html = renderHtml();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCache(res);
    res.end(html);
    return;
  }
  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log('QR diagnostics listening on http://' + HOST + ':' + PORT + '/qr');
});

pollBackend();
pollTimer = setInterval(pollBackend, POLL_INTERVAL_MS);
