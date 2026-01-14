#!/usr/bin/env node
/**
 * Simple regression guard for committed secrets.
 * - Scans tracked files only (git ls-files)
 * - Fails CI if it finds likely secrets (private keys, OpenAI keys, Twilio tokens, etc.)
 *
 * This is NOT a replacement for gitleaks; it's a fast, explicit guard.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
}

function isTextFile(buf) {
  // Heuristic: reject if it contains a NUL byte.
  return !buf.includes(0);
}

const patterns = [
  { name: 'pem_private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'openai_key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'twilio_auth_token', re: /\bTWILIO_AUTH_TOKEN\s*=\s*[0-9a-fA-F]{32}\b/ },
  { name: 'railway_token', re: /\bRAILWAY_TOKEN\s*=\s*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/ },
];

const allowList = [
  // public Firebase apiKeys are expected in google-services.json and web configs
  /google-services\.json$/i,
];

function isAllowed(path) {
  return allowList.some((re) => re.test(path));
}

function main() {
  const files = sh('git ls-files').split(/\r?\n/).filter(Boolean);
  const hits = [];

  for (const f of files) {
    if (isAllowed(f)) continue;
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch {
      continue;
    }
    if (!isTextFile(buf)) continue;
    const text = buf.toString('utf8');

    for (const p of patterns) {
      const m = text.match(p.re);
      if (!m) continue;
      // Ignore obvious placeholder templates like "<OPENAI_API_KEY>"
      if (String(m[0]).includes('<') || String(m[0]).includes('>')) continue;
      hits.push({ file: f, pattern: p.name, match: m[0] });
    }
  }

  if (hits.length) {
    // eslint-disable-next-line no-console
    console.error('Secret guard failed. Potential secrets detected:');
    for (const h of hits.slice(0, 50)) {
      // eslint-disable-next-line no-console
      console.error(`- ${h.file} [${h.pattern}] ${h.match.substring(0, 80)}`);
    }
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log('Secret guard OK (no obvious secrets in tracked files).');
}

main();

