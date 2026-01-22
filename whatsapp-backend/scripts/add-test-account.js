#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseArgs(argv) {
  const out = { name: 'Test', baseUrl: 'http://127.0.0.1:8080' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--name') {
      out.name = argv[i + 1] || out.name;
      i += 1;
    } else if (arg === '--baseUrl') {
      out.baseUrl = argv[i + 1] || out.baseUrl;
      i += 1;
    }
  }
  return out;
}

function requestJson(url, body) {
  const payload = JSON.stringify(body);
  const target = new URL(url);
  const lib = target.protocol === 'https:' ? https : http;

  const options = {
    method: 'POST',
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
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
    req.write(payload);
    req.end();
  });
}

async function main() {
  const { name, baseUrl } = parseArgs(process.argv);
  const url = new URL('/api/whatsapp/add-account', baseUrl).toString();
  try {
    const res = await requestJson(url, { name });
    let parsed = {};
    try { parsed = JSON.parse(res.body); } catch (_) {}

    const accountId = parsed.accountId || parsed?.account?.id || null;
    const status = parsed.status || parsed?.account?.status || null;
    const ok = res.statusCode >= 200 && res.statusCode < 300;

    console.log(JSON.stringify({ ok, status, accountId }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, status: 'request_failed', accountId: null }));
    process.exitCode = 1;
  }
}

main();
