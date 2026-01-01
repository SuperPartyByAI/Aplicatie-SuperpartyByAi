#!/usr/bin/env node

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const ACCOUNT_ID = 'debug_test_' + Date.now();
const AUTH_DIR = path.join(__dirname, '..', '.baileys_auth', ACCOUNT_ID);

console.log('=== DEBUG QR GENERATION ===');
console.log(`BOOT: ${new Date().toISOString()}`);
console.log(`ACCOUNT_ID: ${ACCOUNT_ID}`);
console.log(`AUTH_DIR: ${AUTH_DIR}`);

// Ensure auth directory exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  console.log(`✅ Created auth directory`);
}

let qrEmitted = false;
const pairingEmitted = false;
let connected = false;

async function startDebug() {
  try {
    console.log('\n--- PHASE 1: Loading auth state ---');
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    console.log(`✅ Auth state loaded`);
    console.log(`   Has creds: ${!!state.creds}`);
    console.log(`   Has keys: ${!!state.keys}`);

    console.log('\n--- PHASE 2: Fetching latest Baileys version ---');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`✅ Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);

    console.log('\n--- PHASE 3: Creating socket ---');
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['SuperParty', 'Chrome', '1.0.0'],
      version,
    });
    console.log(`✅ SOCKET_CREATED: ${new Date().toISOString()}`);

    // Heartbeat
    const heartbeat = setInterval(() => {
      console.log(
        `💓 HEARTBEAT: ${new Date().toISOString()} | QR: ${qrEmitted} | Pairing: ${pairingEmitted} | Connected: ${connected}`
      );
    }, 5000);

    console.log('\n--- PHASE 4: Attaching handlers ---');

    // QR handler
    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`\n🔔 CONNECTION_UPDATE: ${new Date().toISOString()}`);
      console.log(`   connection: ${connection}`);
      console.log(`   qr: ${qr ? 'YES (length=' + qr.length + ')' : 'NO'}`);
      console.log(
        `   lastDisconnect: ${
          lastDisconnect
            ? JSON.stringify({
                error: lastDisconnect.error?.message,
                statusCode: lastDisconnect.error?.output?.statusCode,
                reason: lastDisconnect.error?.output?.payload?.error,
              })
            : 'NO'
        }`
      );

      if (qr) {
        qrEmitted = true;
        console.log(`✅ QR_EMITTED: ${new Date().toISOString()}`);
        console.log(`   QR prefix: ${qr.substring(0, 20)}...`);
        console.log(`   QR length: ${qr.length}`);

        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          console.log(`✅ QR converted to data URL (length: ${qrDataURL.length})`);
        } catch (err) {
          console.error(`❌ QR conversion failed:`, err.message);
        }
      }

      if (connection === 'open') {
        connected = true;
        console.log(`✅ CONNECTED: ${new Date().toISOString()}`);
        console.log(`   Phone: ${sock.user?.id}`);
        clearInterval(heartbeat);

        // Success - exit after 5 seconds
        setTimeout(() => {
          console.log('\n=== DEBUG COMPLETE: SUCCESS ===');
          process.exit(0);
        }, 5000);
      }

      if (connection === 'close') {
        console.log(`❌ CONNECTION_CLOSED: ${new Date().toISOString()}`);
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`   Should reconnect: ${shouldReconnect}`);

        clearInterval(heartbeat);

        if (!shouldReconnect) {
          console.log('\n=== DEBUG COMPLETE: LOGGED OUT ===');
          process.exit(1);
        }
      }
    });

    // Creds update
    sock.ev.on('creds.update', saveCreds);
    console.log(`✅ Handlers attached`);

    console.log('\n--- PHASE 5: Waiting for events (60 seconds max) ---');

    // Timeout after 60 seconds
    setTimeout(() => {
      clearInterval(heartbeat);
      console.log('\n=== DEBUG TIMEOUT ===');
      console.log(`QR emitted: ${qrEmitted}`);
      console.log(`Pairing emitted: ${pairingEmitted}`);
      console.log(`Connected: ${connected}`);

      if (!qrEmitted && !pairingEmitted && !connected) {
        console.error('❌ FAIL: No QR, no pairing, no connection after 60s');
        process.exit(1);
      }

      process.exit(0);
    }, 60000);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

startDebug();
