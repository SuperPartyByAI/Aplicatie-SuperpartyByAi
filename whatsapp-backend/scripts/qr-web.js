#!/usr/bin/env node

const crypto = require('crypto');
const http = require('http');
const url = require('url');
const QRCode = require('qrcode');
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { createQrSocket } = require('./wa-qr-helper');

const PORT = Number(process.env.QR_WEB_PORT || 8787);
const HOST = '127.0.0.1';
const RAW_DIAG_TOKEN = process.env.DIAG_TOKEN || '';
const ALLOW_NO_TOKEN_LOCAL = String(process.env.NO_TOKEN_LOCAL || 'false') === 'true';
const ACCOUNT_ID = process.env.QR_ACCOUNT_ID || process.env.ACCOUNT_ID || 'qr_diag_account';

const normalizeToken = (value) => String(value || '').trim().replace(/[\r\n]/g, '');
const hash8 = (value) =>
  value ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 8) : null;

const DIAG_TOKEN = normalizeToken(RAW_DIAG_TOKEN);
const TOKEN_LEN = DIAG_TOKEN.length;
const TOKEN_SHA8 = hash8(DIAG_TOKEN);

if (!DIAG_TOKEN && !ALLOW_NO_TOKEN_LOCAL) {
  console.error('DIAG_TOKEN is required (or NO_TOKEN_LOCAL=true for local requests)');
  process.exit(1);
}

const state = {
  connected: false,
  connection: 'starting',
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderHtml = () => {
  const connected = state.connected;
  const statusText = connected ? 'CONNECTED' : 'NOT CONNECTED';
  const refreshScript = connected
    ? ''
    : "<script>setTimeout(() => window.location.reload(), 2000);</script>";

  let body = `<h2>Status: ${escapeHtml(statusText)}</h2>`;
  if (connected) {
    const connectedAt = state.connectedAt ? escapeHtml(state.connectedAt) : 'unknown';
    body += `<p>Device is connected. Connected at ${connectedAt}.</p>`;
    body += '<button onclick="window.close()">Close</button>';
  } else if (state.qrDataUrl) {
    body += '<p>Scan this QR with WhatsApp → Linked devices.</p>';
    body += `<img src="${state.qrDataUrl}" alt="WhatsApp QR" />`;
  } else {
    body += '<p>Waiting for QR…</p>';
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WhatsApp QR Diagnostics</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      img { max-width: 320px; height: auto; border: 1px solid #ddd; }
    </style>
  </head>
  <body>
    ${body}
    ${refreshScript}
  </body>
</html>`;
};

const isLocalRequest = (req) => {
  const remote = String(req.socket?.remoteAddress || '');
  const host = String(req.headers.host || '');
  return (
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote.endsWith('127.0.0.1') ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1')
  );
};

const validateToken = (req) => {
  const parsed = url.parse(req.url, true);
  const queryToken = normalizeToken(parsed.query.token);
  const headerToken = normalizeToken(req.headers['x-diag-token']);
  const token = queryToken || headerToken;
  if (!token && ALLOW_NO_TOKEN_LOCAL && isLocalRequest(req)) {
    return { ok: true, usedLocalBypass: true };
  }
  return {
    ok: Boolean(token && token === DIAG_TOKEN),
    expectedSha8: TOKEN_SHA8,
    expectedLen: TOKEN_LEN,
    gotSha8: hash8(token),
    gotLen: token.length,
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

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/health')) {
    const auth = validateToken(req);
    if (!auth.ok) {
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
      tokenSha8: TOKEN_SHA8,
      tokenLen: TOKEN_LEN,
      port: PORT,
    });
    return;
  }
  if (req.url && req.url.startsWith('/qr')) {
    const auth = validateToken(req);
    if (!auth.ok) {
      sendJson(res, 401, {
        error: 'unauthorized',
        expectedSha8: auth.expectedSha8 || null,
        gotSha8: auth.gotSha8 || null,
        expectedLen: auth.expectedLen || 0,
        gotLen: auth.gotLen || 0,
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

const startSocket = async () => {
  const { sock } = await createQrSocket({ accountId: ACCOUNT_ID, loggerLevel: 'silent' });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection) {
      state.connection = connection;
    }

    if (qr && typeof qr === 'string') {
      try {
        state.lastQrString = qr;
        state.qrDataUrl = await QRCode.toDataURL(qr);
        state.qrUpdatedAt = new Date().toISOString();
        state.qrSeq += 1;
        state.qrHash8 = hash8(qr);
        console.log(`qr_update seq=${state.qrSeq} hash8=${state.qrHash8}`);
      } catch {
        state.qrDataUrl = null;
      }
    }

    if (connection === 'open') {
      state.connected = true;
      state.qrDataUrl = null;
      state.connectedAt = new Date().toISOString();
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      state.connected = false;
      if (!shouldReconnect) {
        state.qrDataUrl = null;
      }
    }
  });
};

server.listen(PORT, HOST, () => {
  console.log(`QR diagnostics listening on http://${HOST}:${PORT}/qr`);
});

startSocket().catch((err) => {
  console.error(`Failed to start QR diagnostics: ${err.message}`);
  process.exit(1);
});
