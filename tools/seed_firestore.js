/**
 * Seed Firestore with:
 * - teams: team_a, team_b, team_c
 * - teamCodePools: matching prefixes + freeCodes
 *
 * Usage:
 *   # (recommended) Firestore emulator:
 *   node tools/seed_firestore.js --emulator
 *
 *   # production (requires GOOGLE_APPLICATION_CREDENTIALS):
 *   node tools/seed_firestore.js --project <projectId>
 */

const fs = require('node:fs');
const path = require('node:path');

function loadAdminSdk() {
  try {
    // Prefer the Functions workspace dependencies (already installed for this repo)
    // so root does not need its own node_modules.
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
  } catch (e) {
    // eslint-disable-next-line global-require
    return require('firebase-admin');
  }
}

function readDefaultProjectId() {
  const candidates = [
    path.join(__dirname, '..', '.firebaserc'),
    path.join(__dirname, '..', 'functions', '.firebaserc'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const json = JSON.parse(raw);
      const projectId = json?.projects?.default;
      if (projectId) return projectId;
    } catch (_) {}
  }
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
}

function readEmulatorPorts() {
  // Read firebase.json as single source of truth for emulator ports
  const firebaseJsonPath = path.join(__dirname, '..', 'firebase.json');
  try {
    const raw = fs.readFileSync(firebaseJsonPath, 'utf8');
    const json = JSON.parse(raw);
    const firestorePort = json?.emulators?.firestore?.port || 8082;
    const firestoreHost = json?.emulators?.firestore?.host || '127.0.0.1';
    return { host: firestoreHost, port: firestorePort };
  } catch (e) {
    // Fallback to firebase.json defaults if file not found or invalid
    console.warn('[seed] ⚠️  Could not read firebase.json, using defaults:', e.message);
    return { host: '127.0.0.1', port: 8082 };
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

async function main() {
  const useEmulator = process.argv.includes('--emulator');
  const projectId = (argValue('--project') || readDefaultProjectId() || '').trim();

  if (!projectId) {
    console.error('Missing projectId. Use --project <id> or set FIREBASE_PROJECT_ID, or ensure .firebaserc exists.');
    process.exit(1);
  }

  if (useEmulator) {
    // Prefer env var if set, otherwise read from firebase.json
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      const emulatorConfig = readEmulatorPorts();
      process.env.FIRESTORE_EMULATOR_HOST = `${emulatorConfig.host}:${emulatorConfig.port}`;
    }
    console.log('[seed] Using Firestore emulator at', process.env.FIRESTORE_EMULATOR_HOST);
  }

  const admin = loadAdminSdk();

  if (!admin.apps.length) {
    // In production this uses GOOGLE_APPLICATION_CREDENTIALS.
    // In emulator mode, credentials are not required.
    admin.initializeApp({ projectId });
  }

  const db = admin.firestore();

  const teams = [
    { id: 'team_a', label: 'Echipa A', prefix: 'A', start: 101, end: 150 },
    { id: 'team_b', label: 'Echipa B', prefix: 'B', start: 201, end: 250 },
    { id: 'team_c', label: 'Echipa C', prefix: 'C', start: 301, end: 350 },
  ];

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const t of teams) {
    const teamRef = db.collection('teams').doc(t.id);
    batch.set(
      teamRef,
      {
        label: t.label,
        active: true,
        updatedAt: now,
      },
      { merge: true },
    );

    const codes = [];
    for (let n = t.start; n <= t.end; n++) codes.push(n);

    const poolRef = db.collection('teamCodePools').doc(t.id);
    batch.set(
      poolRef,
      {
        prefix: t.prefix,
        freeCodes: codes,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();
  console.log('[seed] ✅ Seed completed for project:', projectId);
  console.log('[seed] Teams:', teams.map(t => t.id).join(', '));
}

main().catch(err => {
  console.error('[seed] ❌ Failed:', err);
  process.exit(1);
});

