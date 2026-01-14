#!/usr/bin/env node
/**
 * WAL replay tool (idempotent).
 *
 * Example:
 *   node whatsapp-connector/scripts/wal_replay.js --accountId wa_xxx --since "2026-01-14T00:00:00Z" --until "2026-01-14T23:59:59Z"
 */

require('dotenv').config();

const { initFirebase, getDb, getAdmin } = require('../src/firestore');
const { processIngestDoc } = require('../src/ingest');

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function boolArg(name) {
  const v = arg(name);
  if (v == null) return false;
  return v === '1' || v === 'true' || v === 'yes';
}

function must(v, name) {
  if (!v) throw new Error(`Missing required arg: --${name}`);
  return v;
}

function parseDate(s, name) {
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for --${name}: ${s}`);
  return d;
}

async function main() {
  const accountId = must(arg('accountId'), 'accountId');
  const since = parseDate(must(arg('since'), 'since'), 'since');
  const until = parseDate(must(arg('until'), 'until'), 'until');
  const dryRun = boolArg('dryRun');
  const force = boolArg('force');
  const maxAttempts = Number(process.env.INGEST_MAX_ATTEMPTS || 5) || 5;

  initFirebase();
  const db = getDb();
  const admin = getAdmin();

  const sinceTs = admin.firestore.Timestamp.fromDate(since);
  const untilTs = admin.firestore.Timestamp.fromDate(until);

  console.log('wal_replay:start', { accountId, since: since.toISOString(), until: until.toISOString(), dryRun, force });

  // Query WAL range (requires an index: accountId + receivedAt)
  let q = db
    .collection('whatsapp_ingest')
    .where('accountId', '==', accountId)
    .where('receivedAt', '>=', sinceTs)
    .where('receivedAt', '<=', untilTs)
    .orderBy('receivedAt', 'asc')
    .limit(500);

  let processed = 0;
  let skippedAlreadyProcessed = 0;
  let dlqMoved = 0;
  let errors = 0;

  while (true) {
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      try {
        const data = doc.data() || {};
        if (data.processed === true && !force) {
          skippedAlreadyProcessed += 1;
          continue;
        }
        if (!dryRun) {
          // Mark as unprocessed if forcing; projection is idempotent anyway.
          if (force && data.processed === true) {
            await doc.ref.set({ processed: false, processedAt: null }, { merge: true });
          }
          await processIngestDoc(doc);
        }
        processed += 1;
      } catch (e) {
        errors += 1;
        const err = String(e?.message || e);
        console.error('wal_replay:error', { id: doc.id, err });

        if (dryRun) continue;

        // DLQ handling (mirror ingest loop behavior)
        try {
          const cur = (await doc.ref.get()).data() || {};
          const attempts = Number(cur.processAttempts || 0) + 1;
          if (attempts >= maxAttempts) {
            await db.collection('whatsapp_ingest_deadletter').doc(doc.id).set(
              {
                ...cur,
                processed: true,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                processAttempts: attempts,
                lastProcessError: err,
                deadletteredAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            await doc.ref.set(
              {
                processed: true,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                processAttempts: attempts,
                lastProcessError: err,
              },
              { merge: true },
            );
            dlqMoved += 1;
          } else {
            await doc.ref.set(
              {
                processed: false,
                processedAt: null,
                processAttempts: attempts,
                lastProcessError: err,
              },
              { merge: true },
            );
          }
        } catch (e2) {
          console.error('wal_replay:dlq_error', { id: doc.id, err: String(e2?.message || e2) });
        }
      }
    }

    const last = snap.docs[snap.docs.length - 1];
    q = db
      .collection('whatsapp_ingest')
      .where('accountId', '==', accountId)
      .where('receivedAt', '>=', sinceTs)
      .where('receivedAt', '<=', untilTs)
      .orderBy('receivedAt', 'asc')
      .startAfter(last)
      .limit(500);
  }

  console.log('wal_replay:done', { processed, skippedAlreadyProcessed, dlqMoved, errors });
  if (errors) process.exit(2);
}

main().catch((e) => {
  console.error('wal_replay:fatal', { err: String(e?.message || e) });
  process.exit(1);
});

