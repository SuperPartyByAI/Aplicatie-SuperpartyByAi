const https = require('https');

const API_URL = process.env.BAILEYS_BASE_URL || 'http://37.27.34.179:8080';
const DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const startTime = Date.now();
let heartbeats = 0;
let failures = 0;

function checkHealth() {
  return new Promise((resolve, reject) => {
    https
      .get(`${API_URL}/health`, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const health = JSON.parse(data);
            resolve(health);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function heartbeat() {
  try {
    const health = await checkHealth();
    heartbeats++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60);
    console.log(
      `[${elapsed}min] Heartbeat ${heartbeats}: status=${health.status}, uptime=${health.uptime}s, accounts=${health.accounts.total}`
    );

    if (health.status !== 'healthy') {
      failures++;
      console.error(`❌ Health check failed: ${health.status}`);
    }
  } catch (error) {
    failures++;
    console.error(`❌ Heartbeat failed: ${error.message}`);
  }
}

async function runSoakTest() {
  console.log('=== SOAK TEST (2 HOURS) ===');
  console.log('Start time:', new Date().toISOString());
  console.log('Duration: 2 hours');
  console.log('Heartbeat interval: 15 minutes');
  console.log('');

  // Initial heartbeat
  await heartbeat();

  // Set up periodic heartbeats
  const interval = setInterval(async () => {
    await heartbeat();

    const elapsed = Date.now() - startTime;
    if (elapsed >= DURATION_MS) {
      clearInterval(interval);

      console.log('');
      console.log('=== SOAK TEST COMPLETE ===');
      console.log('Duration:', Math.floor(elapsed / 1000 / 60), 'minutes');
      console.log('Heartbeats:', heartbeats);
      console.log('Failures:', failures);

      const uptime = (((heartbeats - failures) / heartbeats) * 100).toFixed(2);
      console.log('Uptime:', uptime, '%');

      if (uptime >= 99) {
        console.log('✅ PASS: Uptime >= 99%');
        process.exit(0);
      } else {
        console.log('❌ FAIL: Uptime < 99%');
        process.exit(1);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

runSoakTest().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
