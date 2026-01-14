const { getDb, getAdmin, initFirebase } = require('./firestore');

function daysMs(d) {
  return d * 24 * 60 * 60 * 1000;
}

async function deleteOldDocs({ collection, olderThanMs, statusFilter = null, batchSize = 200, dryRun = true }) {
  const db = getDb();
  const admin = getAdmin();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);

  let q = db.collection(collection).where('createdAt', '<', cutoff).limit(batchSize);
  if (statusFilter) {
    q = db.collection(collection).where('status', '==', statusFilter).where('createdAt', '<', cutoff).limit(batchSize);
  }

  let total = 0;
  while (true) {
    const snap = await q.get();
    if (snap.empty) break;
    total += snap.size;
    if (!dryRun) {
      const b = db.batch();
      for (const d of snap.docs) b.delete(d.ref);
      await b.commit();
    }
    if (snap.size < batchSize) break;
  }
  return total;
}

async function main() {
  initFirebase();
  const dryRun = (process.env.DRY_RUN || 'true').toString().toLowerCase() !== 'false';

  // Defaults per requirement
  const walDays = Number(process.env.RETENTION_WAL_DAYS || 30);
  const outboxDays = Number(process.env.RETENTION_OUTBOX_DAYS || 7);

  const walDeleted = await deleteOldDocs({
    collection: 'whatsapp_ingest',
    olderThanMs: daysMs(walDays),
    dryRun,
  });

  const outboxSentDeleted = await deleteOldDocs({
    collection: 'whatsapp_outbox',
    olderThanMs: daysMs(outboxDays),
    statusFilter: 'sent',
    dryRun,
  });

  const outboxFailedDeleted = await deleteOldDocs({
    collection: 'whatsapp_outbox',
    olderThanMs: daysMs(outboxDays),
    statusFilter: 'failed',
    dryRun,
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        walDays,
        outboxDays,
        walDeleted,
        outboxSentDeleted,
        outboxFailedDeleted,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}

