#!/usr/bin/env node
/**
 * Local smoke test server (NO Flutter) for PR #34.
 *
 * Server:
 *   http://127.0.0.1:5179
 *
 * It talks to Firestore + Functions emulators and exposes:
 * - seed
 * - run 9-item smoke suite
 * - last report/logs
 * - step endpoints (allocate/finalize/admin change team/admin status)
 *
 * Constraints:
 * - fixed UIDs (no user input required)
 * - emulator only
 */
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const express = require('express');

const HOST = '127.0.0.1';
const PORT = 5179;

const FIXED_UIDS = {
  staffNonKyc: 'staff_nokyc_1',
  staffKyc: 'staff_kyc_1',
  admin: 'admin_1',
  notAdmin: 'not_admin_1',
};

let lastReport = null;
let lastLogs = [];
let lastUpdatedAt = null;

function readFirebaseJson() {
  const p = path.join(__dirname, '..', 'firebase.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
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
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-superparty';
}

function parseHost(host, fallbackPort) {
  const s = String(host || '').trim();
  if (!s) return { host: '127.0.0.1', port: fallbackPort };
  const [h, p] = s.split(':');
  return { host: h || '127.0.0.1', port: Number(p || String(fallbackPort)) };
}

function httpPing(host, port, pathname = '/') {
  return new Promise(resolve => {
    const req = http.request(
      { host, port, path: pathname, method: 'GET', timeout: 1200 },
      res => {
        res.resume();
        resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      try {
        req.destroy();
      } catch (_) {}
      resolve(false);
    });
    req.end();
  });
}

function execNode(scriptPath, args, env) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function loadAdminSdk() {
  try {
    // Prefer the Functions workspace dependencies.
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
  } catch (_) {
    // eslint-disable-next-line global-require
    return require('firebase-admin');
  }
}

function loadCallablesDist() {
  const distIndex = path.join(__dirname, '..', 'functions', 'dist', 'index.js');
  if (!fs.existsSync(distIndex)) {
    const err = new Error('Missing functions/dist/index.js. Build first: cd functions && npm ci && npm run build');
    err.statusCode = 500;
    throw err;
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(distIndex);
}

function formatErr(e) {
  if (!e) return '(unknown error)';
  const code = e.code ? ` code=${String(e.code)}` : '';
  const msg = e.message ? String(e.message) : String(e);
  return `${msg}${code}`.trim();
}

function asInt(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
}

async function ensureEmulatorsReachable(ports) {
  const firestoreOk = await httpPing(ports.firestore.host, ports.firestore.port);
  const functionsOk = await httpPing(ports.functions.host, ports.functions.port);
  return { firestoreOk, functionsOk };
}

function assertAllowedUid(uid) {
  const allowed = new Set([FIXED_UIDS.staffNonKyc, FIXED_UIDS.staffKyc, FIXED_UIDS.admin, FIXED_UIDS.notAdmin]);
  if (!allowed.has(uid)) {
    const err = new Error(`Invalid uid. Allowed: ${Array.from(allowed).join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

async function getAdminDb(projectId, firestoreHost) {
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIREBASE_PROJECT_ID = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;

  const admin = loadAdminSdk();
  if (!admin.apps.length) admin.initializeApp({ projectId });
  return { admin, db: admin.firestore() };
}

async function getPool(db, teamId) {
  const snap = await db.collection('teamCodePools').doc(teamId).get();
  return snap.data() || {};
}
async function getAssignment(db, teamId, uid) {
  const snap = await db.collection('teamAssignments').doc(`${teamId}_${uid}`).get();
  return snap.exists ? snap.data() : null;
}
async function getUser(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}
async function getStaff(db, uid) {
  const snap = await db.collection('staffProfiles').doc(uid).get();
  return snap.exists ? snap.data() : null;
}
async function countHistory(db, uid) {
  const snap = await db.collection('teamAssignmentsHistory').get();
  return snap.docs.map(d => d.data()).filter(d => d.uid === uid).length;
}
async function countAdminActions(db, targetUid) {
  const snap = await db.collection('adminActions').get();
  return snap.docs.map(d => d.data()).filter(d => d.targetUid === targetUid).length;
}

async function runCallable(callables, name, data, auth) {
  const fn = callables[name];
  if (!fn || typeof fn.run !== 'function') {
    const err = new Error(`Callable ${name} missing or not runnable`);
    err.statusCode = 500;
    throw err;
  }
  return await fn.run({ data, auth });
}

function staffAuth(uid, isAdmin) {
  return {
    uid,
    token: {
      email: `${uid}@test.local`,
      ...(isAdmin ? { admin: true } : {}),
    },
  };
}

function buildPortsFromConfig() {
  const fb = readFirebaseJson();
  const emu = fb.emulators || {};
  const firestorePort = emu.firestore?.port || 8080;
  const functionsPort = emu.functions?.port || 5001;
  const uiPort = emu.ui?.port || 4000;

  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || `127.0.0.1:${firestorePort}`;
  const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || `127.0.0.1:${functionsPort}`;

  return {
    projectId: readDefaultProjectId(),
    firestore: parseHost(firestoreHost, firestorePort),
    functions: parseHost(functionsHost, functionsPort),
    ui: { host: '127.0.0.1', port: uiPort },
    firestoreHost,
    functionsHost,
  };
}

async function seed(ports) {
  const seedPath = path.join(__dirname, 'seed_firestore.js');
  const res = execNode(seedPath, ['--emulator'], {
    FIREBASE_PROJECT_ID: ports.projectId,
    GCLOUD_PROJECT: ports.projectId,
    FIRESTORE_EMULATOR_HOST: ports.firestoreHost,
  });
  if (!res.ok) {
    const err = new Error(`Seed failed.\n${res.stderr || res.stdout}`);
    err.statusCode = 500;
    throw err;
  }
  return { ok: true, output: res.stdout };
}

async function runSuite(ports) {
  // Import-and-run (no spawn) so we can return structured JSON.
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { runSmoke } = require(path.join(__dirname, 'smoke_run_emulator.js'));
  process.env.FIRESTORE_EMULATOR_HOST = ports.firestoreHost;
  process.env.FUNCTIONS_EMULATOR_HOST = ports.functionsHost;
  process.env.FIREBASE_PROJECT_ID = ports.projectId;
  process.env.GCLOUD_PROJECT = ports.projectId;
  const report = await runSmoke();
  lastReport = report;
  lastLogs = Array.isArray(report.logs) ? report.logs : [];
  lastUpdatedAt = new Date().toISOString();
  return report;
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', async (_req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  res.json({
    ok: true,
    projectId: ports.projectId,
    emulatorUi: `http://${ports.ui.host}:${ports.ui.port}`,
    firestore: `${ports.firestore.host}:${ports.firestore.port}`,
    functions: `${ports.functions.host}:${ports.functions.port}`,
    firestoreReachable: firestoreOk,
    functionsReachable: functionsOk,
  });
});

app.post('/seed', async (_req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  if (!firestoreOk || !functionsOk) {
    return res.status(503).json({
      ok: false,
      error: `Emulators not reachable. Start: firebase emulators:start --only firestore,functions`,
      firestoreReachable: firestoreOk,
      functionsReachable: functionsOk,
    });
  }
  try {
    const out = await seed(ports);
    lastUpdatedAt = new Date().toISOString();
    lastLogs = [`[seed] ${lastUpdatedAt}`, ...(out.output ? out.output.split(/\r?\n/).filter(Boolean) : [])];
    res.json({ ok: true });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, error: formatErr(e) });
  }
});

app.post('/run', async (_req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  if (!firestoreOk || !functionsOk) {
    return res.status(503).json({
      ok: false,
      error: `Emulators not reachable. Start: firebase emulators:start --only firestore,functions`,
      firestoreReachable: firestoreOk,
      functionsReachable: functionsOk,
    });
  }
  try {
    const report = await runSuite(ports);
    res.json(report);
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, error: formatErr(e) });
  }
});

app.get('/report', (_req, res) => {
  res.json({
    ok: true,
    updatedAt: lastUpdatedAt,
    report: lastReport,
    logs: lastLogs,
  });
});

app.post('/step/allocate', async (req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  if (!firestoreOk || !functionsOk) {
    return res.status(503).json({ ok: false, error: 'Emulators not reachable' });
  }
  try {
    const { teamId, uid, prevTeamId, prevCodeNumber } = req.body || {};
    const t = String(teamId || '').trim();
    const u = String(uid || FIXED_UIDS.staffKyc).trim();
    if (!t) {
      return res.status(400).json({ ok: false, error: 'teamId is required' });
    }
    assertAllowedUid(u);

    const firestoreHost = ports.firestoreHost;
    const { db } = await getAdminDb(ports.projectId, firestoreHost);
    const callables = loadCallablesDist();

    const beforePool = await getPool(db, t);
    const beforeAssign = await getAssignment(db, t, u);
    const beforeHistory = await countHistory(db, u);

    const payload = await runCallable(
      callables,
      'allocateStaffCode',
      {
        teamId: t,
        ...(prevTeamId ? { prevTeamId: String(prevTeamId).trim() } : {}),
        ...(prevCodeNumber != null ? { prevCodeNumber: Number(prevCodeNumber) } : {}),
      },
      staffAuth(u, false),
    );

    const afterPool = await getPool(db, t);
    const afterAssign = await getAssignment(db, t, u);
    const afterHistory = await countHistory(db, u);

    res.json({
      ok: true,
      payload,
      diffs: {
        pool: { before: { prefix: beforePool.prefix, freeCodesCount: (beforePool.freeCodes || []).length }, after: { prefix: afterPool.prefix, freeCodesCount: (afterPool.freeCodes || []).length } },
        assignment: { before: beforeAssign, after: afterAssign },
        historyCount: { before: beforeHistory, after: afterHistory },
      },
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, error: formatErr(e) });
  }
});

app.post('/step/finalize', async (req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  if (!firestoreOk || !functionsOk) {
    return res.status(503).json({ ok: false, error: 'Emulators not reachable' });
  }
  try {
    const { uid, phone, teamId, assignedCode } = req.body || {};
    const u = String(uid || FIXED_UIDS.staffKyc).trim();
    assertAllowedUid(u);
    const t = String(teamId || '').trim();
    const p = String(phone || '').trim();
    const c = String(assignedCode || '').trim();
    if (!t || !p || !c) {
      return res.status(400).json({ ok: false, error: 'uid, phone, teamId, assignedCode are required' });
    }

    const { db } = await getAdminDb(ports.projectId, ports.firestoreHost);
    const callables = loadCallablesDist();

    const payload = await runCallable(
      callables,
      'finalizeStaffSetup',
      { phone: p, teamId: t, assignedCode: c },
      staffAuth(u, false),
    );

    const staff = await getStaff(db, u);
    const user = await getUser(db, u);

    res.json({ ok: true, payload, staffProfiles: staff, users: user });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, error: formatErr(e) });
  }
});

app.post('/step/admin/change-team', async (req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  if (!firestoreOk || !functionsOk) {
    return res.status(503).json({ ok: false, error: 'Emulators not reachable' });
  }
  try {
    const { uid, newTeamId, forceReallocate } = req.body || {};
    const u = String(uid || FIXED_UIDS.staffKyc).trim();
    assertAllowedUid(u);
    const nt = String(newTeamId || '').trim();
    if (!nt) return res.status(400).json({ ok: false, error: 'uid and newTeamId are required' });

    const { db } = await getAdminDb(ports.projectId, ports.firestoreHost);
    const callables = loadCallablesDist();

    const beforeStaff = await getStaff(db, u);
    const beforeOldTeam = String(beforeStaff?.teamId || '').trim();
    const beforeOldCode = String(beforeStaff?.assignedCode || '').trim();
    const oldNum = beforeOldCode ? asInt(beforeOldCode.replace(/^\D+/, '')) : null;
    const beforeOldPool = beforeOldTeam ? await getPool(db, beforeOldTeam) : null;
    const beforeNewPool = await getPool(db, nt);
    const beforeHistory = await countHistory(db, u);
    const beforeActions = await countAdminActions(db, u);

    const payload = await runCallable(
      callables,
      'changeUserTeam',
      { uid: u, newTeamId: nt, ...(forceReallocate === true ? { forceReallocate: true } : {}) },
      staffAuth(FIXED_UIDS.admin, true),
    );

    const afterStaff = await getStaff(db, u);
    const afterOldPool = beforeOldTeam ? await getPool(db, beforeOldTeam) : null;
    const afterNewPool = await getPool(db, nt);
    const afterHistory = await countHistory(db, u);
    const afterActions = await countAdminActions(db, u);

    res.json({
      ok: true,
      payload,
      diffs: {
        staffProfiles: { before: beforeStaff, after: afterStaff },
        pools: {
          oldTeamId: beforeOldTeam || null,
          newTeamId: nt,
          oldPool: beforeOldPool && afterOldPool ? { beforeCount: (beforeOldPool.freeCodes || []).length, afterCount: (afterOldPool.freeCodes || []).length, oldReturned: oldNum != null ? (afterOldPool.freeCodes || []).map(asInt).includes(oldNum) : null } : null,
          newPool: { beforeCount: (beforeNewPool.freeCodes || []).length, afterCount: (afterNewPool.freeCodes || []).length },
        },
        historyCount: { before: beforeHistory, after: afterHistory },
        adminActionsCount: { before: beforeActions, after: afterActions },
      },
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, error: formatErr(e) });
  }
});

app.post('/step/admin/status', async (req, res) => {
  const ports = buildPortsFromConfig();
  const { firestoreOk, functionsOk } = await ensureEmulatorsReachable(ports);
  if (!firestoreOk || !functionsOk) {
    return res.status(503).json({ ok: false, error: 'Emulators not reachable' });
  }
  try {
    const { uid, status } = req.body || {};
    const u = String(uid || FIXED_UIDS.staffKyc).trim();
    assertAllowedUid(u);
    const st = String(status || '').trim();
    if (!st) return res.status(400).json({ ok: false, error: 'uid and status are required' });

    const { db } = await getAdminDb(ports.projectId, ports.firestoreHost);
    const callables = loadCallablesDist();

    const beforeUser = await getUser(db, u);
    const beforeActions = await countAdminActions(db, u);

    const payload = await runCallable(
      callables,
      'setUserStatus',
      { uid: u, status: st },
      staffAuth(FIXED_UIDS.admin, true),
    );

    const afterUser = await getUser(db, u);
    const afterActions = await countAdminActions(db, u);

    res.json({
      ok: true,
      payload,
      diffs: {
        users: { before: beforeUser, after: afterUser },
        adminActionsCount: { before: beforeActions, after: afterActions },
      },
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, error: formatErr(e) });
  }
});

app.listen(PORT, HOST, () => {
  const ports = buildPortsFromConfig();
  console.log(`[smoke-server] listening on http://${HOST}:${PORT}`);
  console.log(`[smoke-server] emulator UI: http://${ports.ui.host}:${ports.ui.port}`);
  console.log(`[smoke-server] firestore: ${ports.firestore.host}:${ports.firestore.port}`);
  console.log(`[smoke-server] functions: ${ports.functions.host}:${ports.functions.port}`);
});

