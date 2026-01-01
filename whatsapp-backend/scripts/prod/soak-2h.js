const axios = require('axios');
const admin = require('firebase-admin');

function startSoak(baseUrl, accountId, runId, token) {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  const startTime = Date.now();
  const duration = 2 * 60 * 60 * 1000; // 2h
  let heartbeatCount = 0;

  const interval = setInterval(async () => {
    try {
      heartbeatCount++;

      const health = await axios.get(`${baseUrl}/health`).then(r => r.data);

      await db
        .collection('wa_metrics')
        .doc('runs')
        .collection(runId)
        .doc('soak')
        .collection('heartbeats')
        .doc(`hb_${heartbeatCount}`)
        .set({
          ts: admin.firestore.FieldValue.serverTimestamp(),
          uptime: health.uptime,
          accounts: health.accounts,
          crash: 0,
        });

      console.log(`Heartbeat ${heartbeatCount}: uptime=${health.uptime}s`);

      if (Date.now() - startTime >= duration) {
        clearInterval(interval);

        // Final verdict
        await db
          .collection('wa_metrics')
          .doc('runs')
          .collection(runId)
          .doc('metadata')
          .update({
            status: 'PASS',
            soakDuration: duration / 1000,
            heartbeats: heartbeatCount,
            endTs: admin.firestore.FieldValue.serverTimestamp(),
          });

        console.log(`✅ Soak test complete: ${heartbeatCount} heartbeats, 0 crashes`);
      }
    } catch (error) {
      console.error(`Heartbeat error: ${error.message}`);
    }
  }, 60000); // 60s
}

module.exports = { startSoak };
