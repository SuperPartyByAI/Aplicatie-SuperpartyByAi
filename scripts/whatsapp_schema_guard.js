#!/usr/bin/env node
/**
 * WhatsApp schema guard (repo-wide, cutover safety).
 *
 * Goal: after cutover to the canonical Firestore schema, prevent accidental reintroduction
 * of legacy collection names in non-legacy code paths.
 *
 * This guard intentionally:
 * - scans tracked files only (git ls-files)
 * - excludes legacy runtimes that are kept for historical reference
 * - fails CI if forbidden collection names are referenced outside those legacy paths
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
}

function isTextFile(buf) {
  return !buf.includes(0);
}

const legacyAllowList = [
  // Legacy runtimes (must not be production truth)
  /^whatsapp-backend\//,
  /^whatsapp-server\.js$/,
  /^functions\/whatsapp\//,
  /^functions\/index\.js$/, // legacy whatsappV4 wiring lives here
  // Connector tests intentionally contain forbidden needles
  /^whatsapp-connector\/test\//,
  // Legacy/diagnostic scripts kept for reference
  /^check-firestore-collections\.js$/,
  /^check-firestore\.js$/,
  /^functions\/firebase\/firestore\.js$/,
  /^src\/firebase\/firestore\.js$/,
  // Docs/notes (may mention legacy names for explanation)
  /^docs\//,
  /\.md$/i,
  /^WHATSAPP_/,
  /^MIGRATION\.md$/,
];

function isLegacyPath(p) {
  return legacyAllowList.some((re) => re.test(p));
}

// Forbidden legacy collection names (cutover regression targets).
const forbiddenNeedles = [
  "collection('accounts')",
  'collection("accounts")',
  "collection('threads')",
  'collection("threads")',
  "collection('outbox')",
  'collection("outbox")',
  // legacy camelCase collections removed during cutover
  "collection('whatsappConversations')",
  'collection("whatsappConversations")',
  "collection('whatsappMessages')",
  'collection("whatsappMessages")',
];

function main() {
  const files = sh('git ls-files').split(/\r?\n/).filter(Boolean);
  const hits = [];

  for (const f of files) {
    if (isLegacyPath(f)) continue;
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch {
      continue;
    }
    if (!isTextFile(buf)) continue;
    const text = buf.toString('utf8');

    for (const needle of forbiddenNeedles) {
      if (text.includes(needle)) {
        hits.push({ file: f, needle });
      }
    }
  }

  if (hits.length) {
    // eslint-disable-next-line no-console
    console.error('WhatsApp schema guard failed: legacy collection reference detected outside legacy paths.');
    for (const h of hits.slice(0, 50)) {
      // eslint-disable-next-line no-console
      console.error(`- ${h.file}: ${h.needle}`);
    }
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log('WhatsApp schema guard OK (no legacy collection references outside legacy paths).');
}

main();

