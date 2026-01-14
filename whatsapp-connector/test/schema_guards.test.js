const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function listFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

test('schema guard: connector must not reference legacy collections', () => {
  const root = path.join(__dirname, '..', 'src');
  const files = listFiles(root).filter((f) => f.endsWith('.js'));
  const offenders = [];

  const forbidden = [
    "collection('accounts')",
    'collection("accounts")',
    "collection('threads')",
    'collection("threads")',
  ];

  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    for (const tok of forbidden) {
      if (s.includes(tok)) offenders.push({ file: f, tok });
    }
  }

  assert.deepEqual(offenders, []);
});

test('QR leak guard: public whatsapp_accounts writes must not include QR fields', () => {
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  // QR fields are allowed ONLY in the private doc writer:
  // `.collection('private').doc('state').set({ qrCodeDataUrl, pairingCode, ... })`
  const window = new Set([".collection('private')", ".doc('state')", '.set(']);
  for (const key of ['qrCodeDataUrl', 'pairingCode']) {
    let idx = 0;
    while (true) {
      const at = serverJs.indexOf(key, idx);
      if (at === -1) break;
      const windowStart = Math.max(0, at - 220);
      const snippet = serverJs.slice(windowStart, at + 80);
      // Keep membership checks Set-based (Sonar): track found needles and validate with `.has(...)`.
      const found = new Set();
      for (const needle of window) {
        if (snippet.includes(needle)) found.add(needle);
      }
      const ok = [...window].every((needle) => window.has(needle) && found.has(needle));
      assert.equal(
        ok,
        true,
        `Found "${key}" outside whatsapp_accounts/{id}/private/state write context`,
      );
      idx = at + key.length;
    }
  }
});

