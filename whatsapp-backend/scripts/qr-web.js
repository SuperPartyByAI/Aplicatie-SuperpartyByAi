#!/usr/bin/env node

const http = require('http');
const url = require('url');
const QRCode = require('qrcode');
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { createQrSocket } = require('./wa-qr-helper');

const PORT = Number(process.env.QR_WEB_PORT || 8787);
const HOST = '127.0.0.1';
const DIAG_TOKEN = process.env.DIAG_TOKEN || '';
const ACCOUNT_ID = process.env.QR_ACCOUNT_ID || process.env.ACCOUNT_ID || 'qr_diag_account';

if (!DIAG_TOKEN) {
  console.error('DIAG_TOKEN is required');
  process.exit(1);
}

const state = {
  connected: false,
  connection: 'starting',
  qrDataUrl: null,
  qrUpdatedAt: null,
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
    : "<script>setTimeout(() => window.location.reload(), 3000);</script>";

  let body = `<h2>Status: ${escapeHtml(statusText)}</h2>`;
  if (connected) {
    body += '<p>Device is connected. You can close this page.</p>';
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

const validateToken = (req) => {
  const parsed = url.parse(req.url, true);
  const queryToken = parsed.query.token;
  const headerToken = req.headers['x-diag-token'];
  const token = queryToken || headerToken;
  return token && token === DIAG_TOKEN;
};

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/qr')) {
    if (!validateToken(req)) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }
    const html = renderHtml();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
        state.qrDataUrl = await QRCode.toDataURL(qr);
        state.qrUpdatedAt = new Date().toISOString();
      } catch {
        state.qrDataUrl = null;
      }
    }

    if (connection === 'open') {
      state.connected = true;
      state.qrDataUrl = null;
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
