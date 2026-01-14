#!/usr/bin/env node
/**
 * Node-only smoke harness for PR #34 (no Flutter needed).
 *
 * What it does:
 * - Assumes Firestore + Functions emulators are running (default ports).
 * - Seeds Firestore (teams + teamCodePools).
 * - Executes Staff + Admin callable flows by invoking the callable handlers' `.run()`
 *   against the Firestore emulator (no Auth emulator required).
 * - Verifies Firestore diffs after each step and prints PASS/FAIL for 9 items.
 *
 * Usage:
 *   node tools/smoke_run_emulator.js
 *
 * Optional env:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001
 *   FIREBASE_PROJECT_ID=<yourProjectId>   (otherwise .firebaserc default)
 */
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

function loadAdminSdk() {
  try {
    // Prefer the Functions workspace dependencies.
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

function exec(command, args, options) {
  const res = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  return res.status === 0;
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

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg);
}

function asInt(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
}

function nowIso() {
  return new Date().toISOString();
}

function formatErr(e) {
  if (!e) return '(unknown error)';
  const code = e.code ? ` code=${String(e.code)}` : '';
  const message = e.message ? String(e.message) : String(e);
  return `${message}${code}`.trim();
}

async function main() {
  const projectId = (readDefaultProjectId() || 'demo-superparty').trim();
  const firestoreHost = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').trim();
  const functionsHost = (process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001').trim();

  const [firestoreIp, firestorePortStr] = firestoreHost.split(':');
  const [functionsIp, functionsPortStr] = functionsHost.split(':');
  const firestorePort = Number(firestorePortStr || '8080');
  const functionsPort = Number(functionsPortStr || '5001');

  console.log(`[smoke] ${nowIso()}`);
  console.log('[smoke] projectId:', projectId);
  console.log('[smoke] FIRESTORE_EMULATOR_HOST:', firestoreHost);
  console.log('[smoke] FUNCTIONS_EMULATOR_HOST:', functionsHost);
  console.log('[smoke] node:', process.version);

  // Best-effort: verify firebase CLI exists (optional but helpful).
  try {
    const ok = exec('firebase', ['--version']);
    if (!ok) console.log('[smoke] ⚠️ firebase CLI not runnable (continuing)');
  } catch (_) {
    console.log('[smoke] ⚠️ firebase CLI not found in PATH (continuing)');
  }

  const firestoreUp = await httpPing(firestoreIp, firestorePort);
  const functionsUp = await httpPing(functionsIp, functionsPort);
  assertOk(
    firestoreUp,
    `Firestore emulator not reachable at ${firestoreHost}. Start it: firebase emulators:start --only firestore,functions`,
  );
  assertOk(
    functionsUp,
    `Functions emulator not reachable at ${functionsHost}. Start it: firebase emulators:start --only firestore,functions`,
  );

  // Ensure Functions/Firestore code sees the right project/emulator.
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FIREBASE_PROJECT_ID = projectId;
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;

  // Seed teams + pools.
  console.log('[smoke] Seeding Firestore...');
  const seeded = exec(process.execPath, [path.join(__dirname, 'seed_firestore.js'), '--emulator'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, FIREBASE_PROJECT_ID: projectId, GCLOUD_PROJECT: projectId, FIRESTORE_EMULATOR_HOST: firestoreHost },
  });
  assertOk(seeded, 'Seed failed. See output above.');

  const admin = loadAdminSdk();
  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = admin.firestore();

  // Require built callables (v2 onCall exposes .run()).
  const distIndex = path.join(__dirname, '..', 'functions', 'dist', 'index.js');
  assertOk(
    fs.existsSync(distIndex),
    `Missing functions/dist/index.js. Build first: cd functions && npm ci && npm run build`,
  );
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const callables = require(distIndex);

  const staffNonKycUid = 'staff_nokyc_1';
  const staffKycUid = 'staff_kyc_1';
  const adminUid = 'admin_1';
  const notAdminUid = 'not_admin_1';

  const ts = admin.firestore.FieldValue.serverTimestamp();

  // Prepare user docs for scenarios.
  await db.collection('users').doc(staffNonKycUid).set({ kycDone: false, updatedAt: ts }, { merge: true });
  await db.collection('users').doc(staffKycUid).set(
    { kycDone: true, kycData: { fullName: 'Test Staff KYC' }, displayName: 'Test Staff KYC', updatedAt: ts },
    { merge: true },
  );
  await db.collection('users').doc(adminUid).set(
    { role: 'admin', displayName: 'Test Admin', updatedAt: ts },
    { merge: true },
  );
  await db.collection('users').doc(notAdminUid).set(
    { displayName: 'Not Admin', updatedAt: ts },
    { merge: true },
  );

  async function getPool(teamId) {
    const snap = await db.collection('teamCodePools').doc(teamId).get();
    return snap.data() || {};
  }
  async function getAssign(teamId, uid) {
    const snap = await db.collection('teamAssignments').doc(`${teamId}_${uid}`).get();
    return snap.exists ? snap.data() : null;
  }
  async function listHistoryFor(uid) {
    const snap = await db.collection('teamAssignmentsHistory').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.uid === uid);
  }
  async function listAdminActionsFor(targetUid) {
    const snap = await db.collection('adminActions').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.targetUid === targetUid);
  }

  async function runCallable(name, data, auth) {
    const fn = callables[name];
    assertOk(fn && typeof fn.run === 'function', `Callable ${name} missing or not runnable`);
    return await fn.run({ data, auth });
  }

  function passFailLabel(ok) {
    return ok ? 'PASS' : 'FAIL';
  }

  const results = [];
  async function runItem(label, fn) {
    try {
      await fn();
      results.push({ label, ok: true });
      console.log(`[${passFailLabel(true)}] ${label}`);
    } catch (e) {
      results.push({ label, ok: false, error: formatErr(e) });
      console.log(`[${passFailLabel(false)}] ${label} — ${formatErr(e)}`);
    }
  }

  // STAFF 1) Non-KYC user → allocation blocked
  await runItem('1) Staff non-KYC → allocate blocked', async () => {
    let threw = false;
    try {
      await runCallable(
        'allocateStaffCode',
        { teamId: 'team_a' },
        { uid: staffNonKycUid, token: { email: 'staff-nokyc@test.local' } },
      );
    } catch (e) {
      threw = true;
      assertOk(String(e.code) === 'failed-precondition', `Expected failed-precondition, got ${formatErr(e)}`);
    }
    assertOk(threw, 'Expected allocation to throw for non-KYC user');
  });

  // STAFF 2) KYC user → select team → code appears (assignment + pool remove max)
  let alloc1 = null;
  await runItem('2) Staff KYC → allocate team_a (assignment + pool updated)', async () => {
    const before = await getPool('team_a');
    const beforeCodes = Array.isArray(before.freeCodes) ? before.freeCodes.map(asInt).filter(v => v != null) : [];
    const beforeMax = beforeCodes.length ? Math.max(...beforeCodes) : null;
    assertOk(beforeMax != null, 'team_a.freeCodes empty before allocation (seed missing?)');

    alloc1 = await runCallable(
      'allocateStaffCode',
      { teamId: 'team_a' },
      { uid: staffKycUid, token: { email: 'staff-kyc@test.local' } },
    );
    assertOk(alloc1 && alloc1.teamId === 'team_a', 'allocateStaffCode did not return team_a');

    const assign = await getAssign('team_a', staffKycUid);
    assertOk(assign, 'Missing teamAssignments/team_a_<uid>');
    assertOk(asInt(assign.code) === beforeMax, `Expected code=${beforeMax}, got ${assign.code}`);
    assertOk(String(assign.prefix || '') === String(before.prefix || ''), 'Prefix mismatch vs pool prefix');

    const after = await getPool('team_a');
    const afterCodes = Array.isArray(after.freeCodes) ? after.freeCodes.map(asInt).filter(v => v != null) : [];
    assertOk(!afterCodes.includes(beforeMax), 'Allocated code still present in team_a.freeCodes');
  });

  // STAFF 3) Change team before save → release old once + allocate new from new team + history
  let alloc2 = null;
  await runItem('3) Staff KYC → change team (release old once + new allocation + history)', async () => {
    assertOk(alloc1 && alloc1.number != null, 'Missing previous allocation from step 2');
    const prevCodeNumber = asInt(alloc1.number);
    assertOk(prevCodeNumber != null, 'Previous code number invalid');

    const beforeOldPool = await getPool('team_a');
    const beforeNewPool = await getPool('team_b');
    const beforeNewCodes = Array.isArray(beforeNewPool.freeCodes) ? beforeNewPool.freeCodes.map(asInt).filter(v => v != null) : [];
    const beforeNewMax = beforeNewCodes.length ? Math.max(...beforeNewCodes) : null;
    assertOk(beforeNewMax != null, 'team_b.freeCodes empty before allocation (seed missing?)');

    const beforeHistory = await listHistoryFor(staffKycUid);

    alloc2 = await runCallable(
      'allocateStaffCode',
      { teamId: 'team_b', prevTeamId: 'team_a', prevCodeNumber },
      { uid: staffKycUid, token: { email: 'staff-kyc@test.local' } },
    );
    assertOk(alloc2 && alloc2.teamId === 'team_b', 'allocateStaffCode did not return team_b');

    // old assignment deleted
    const oldAssign = await getAssign('team_a', staffKycUid);
    assertOk(oldAssign == null, 'Old assignment doc team_a_<uid> was not deleted');

    // new assignment exists
    const newAssign = await getAssign('team_b', staffKycUid);
    assertOk(newAssign, 'Missing new assignment doc team_b_<uid>');
    assertOk(asInt(newAssign.code) === beforeNewMax, `Expected new code=${beforeNewMax}, got ${newAssign.code}`);

    // old pool got old code back
    const afterOldPool = await getPool('team_a');
    const afterOldCodes = Array.isArray(afterOldPool.freeCodes) ? afterOldPool.freeCodes.map(asInt).filter(v => v != null) : [];
    assertOk(afterOldCodes.includes(prevCodeNumber), 'Old code not returned to old pool');

    // new pool removed new code
    const afterNewPool = await getPool('team_b');
    const afterNewCodes = Array.isArray(afterNewPool.freeCodes) ? afterNewPool.freeCodes.map(asInt).filter(v => v != null) : [];
    assertOk(!afterNewCodes.includes(beforeNewMax), 'New allocated code still present in new pool');

    // history created
    const afterHistory = await listHistoryFor(staffKycUid);
    assertOk(afterHistory.length === beforeHistory.length + 1, 'Expected exactly 1 new history entry');
    const last = afterHistory[afterHistory.length - 1];
    assertOk(last.fromTeamId === 'team_a' && last.toTeamId === 'team_b', 'History from/to mismatch');
    assertOk(asInt(last.releasedCode) === prevCodeNumber, 'History releasedCode mismatch');
    assertOk(asInt(last.newCode) === beforeNewMax, 'History newCode mismatch');
  });

  // STAFF 4) Save finalize → staffProfiles + users.staffSetupDone
  await runItem('4) Staff finalize setup (staffProfiles + users updated)', async () => {
    assertOk(alloc2 && alloc2.prefix != null && alloc2.number != null, 'Missing allocation from step 3');
    const assignedCode = `${alloc2.prefix}${asInt(alloc2.number)}`;

    await runCallable(
      'finalizeStaffSetup',
      { phone: '+40722123456', teamId: 'team_b', assignedCode },
      { uid: staffKycUid, token: { email: 'staff-kyc@test.local' } },
    );

    const staffSnap = await db.collection('staffProfiles').doc(staffKycUid).get();
    assertOk(staffSnap.exists, 'staffProfiles/<uid> missing');
    const staff = staffSnap.data() || {};
    assertOk(staff.setupDone === true, 'staffProfiles.setupDone != true');
    assertOk(staff.teamId === 'team_b', 'staffProfiles.teamId mismatch');
    assertOk(staff.assignedCode === assignedCode, 'staffProfiles.assignedCode mismatch');
    assertOk(staff.codIdentificare === assignedCode, 'staffProfiles.codIdentificare mismatch');
    assertOk(staff.ceCodAi === assignedCode, 'staffProfiles.ceCodAi mismatch');
    assertOk(staff.cineNoteaza === assignedCode, 'staffProfiles.cineNoteaza mismatch');
    assertOk(staff.phone === '+40722123456', 'staffProfiles.phone mismatch');

    const userSnap = await db.collection('users').doc(staffKycUid).get();
    const user = userSnap.data() || {};
    assertOk(user.staffSetupDone === true, 'users.staffSetupDone != true');
    assertOk(user.phone === '+40722123456', 'users.phone mismatch');
  });

  // STAFF 5) Reopen (setupDone=true) → update phone only, no new history
  await runItem('5) Staff update phone (no new history)', async () => {
    const beforeHistory = await listHistoryFor(staffKycUid);
    await runCallable(
      'updateStaffPhone',
      { phone: '+40722123457' },
      { uid: staffKycUid, token: { email: 'staff-kyc@test.local' } },
    );
    const staffSnap = await db.collection('staffProfiles').doc(staffKycUid).get();
    const userSnap = await db.collection('users').doc(staffKycUid).get();
    assertOk((staffSnap.data() || {}).phone === '+40722123457', 'staffProfiles.phone not updated');
    assertOk((userSnap.data() || {}).phone === '+40722123457', 'users.phone not updated');
    const afterHistory = await listHistoryFor(staffKycUid);
    assertOk(afterHistory.length === beforeHistory.length, 'Unexpected new history entries on phone update');
  });

  // ADMIN 6) Admin-only gating works for admin callables
  await runItem('6) Admin gating → non-admin blocked, admin allowed', async () => {
    let blocked = false;
    try {
      await runCallable(
        'setUserStatus',
        { uid: staffKycUid, status: 'inactive' },
        { uid: notAdminUid, token: { email: 'not-admin@test.local' } },
      );
    } catch (e) {
      blocked = true;
      assertOk(String(e.code) === 'permission-denied', `Expected permission-denied, got ${formatErr(e)}`);
    }
    assertOk(blocked, 'Expected non-admin call to be blocked');

    await runCallable(
      'setUserStatus',
      { uid: staffKycUid, status: 'active' },
      { uid: adminUid, token: { email: 'admin@test.local', admin: true } },
    );
  });

  // ADMIN 7) "Search" sanity: list staffProfiles and find by code/email (client-side filter)
  await runItem('7) Admin list/search sanity (Firestore list + client-side filter)', async () => {
    const snap = await db.collection('staffProfiles').get();
    const docs = snap.docs.map(d => d.data() || {});
    assertOk(docs.length >= 1, 'No staffProfiles found');
    const found = docs.some(d => String(d.uid || '') === staffKycUid || String(d.email || '').includes('staff'));
    // Email may be empty in emulator harness; accept uid match.
    assertOk(found, 'Could not find seeded staff profile in staffProfiles list');
  });

  // ADMIN 8) Change team → reallocate code + history + adminActions
  let adminAlloc = null;
  await runItem('8) Admin change team (realloc + history + adminActions)', async () => {
    const beforeOldPool = await getPool('team_b');
    const beforeNewPool = await getPool('team_c');
    const beforeNewCodes = Array.isArray(beforeNewPool.freeCodes) ? beforeNewPool.freeCodes.map(asInt).filter(v => v != null) : [];
    const beforeNewMax = beforeNewCodes.length ? Math.max(...beforeNewCodes) : null;
    assertOk(beforeNewMax != null, 'team_c.freeCodes empty before changeUserTeam');

    const beforeHistory = await listHistoryFor(staffKycUid);
    const beforeActions = await listAdminActionsFor(staffKycUid);

    adminAlloc = await runCallable(
      'changeUserTeam',
      { uid: staffKycUid, newTeamId: 'team_c', forceReallocate: false },
      { uid: adminUid, token: { email: 'admin@test.local', admin: true } },
    );
    assertOk(adminAlloc && adminAlloc.teamId === 'team_c', 'changeUserTeam did not return team_c');

    const staffSnap = await db.collection('staffProfiles').doc(staffKycUid).get();
    const staff = staffSnap.data() || {};
    assertOk(staff.teamId === 'team_c', 'staffProfiles.teamId not updated');
    assertOk(String(staff.assignedCode || '').startsWith('C'), 'staffProfiles.assignedCode prefix not updated');

    // Pools adjusted: team_c removed max; team_b got previous back (if present)
    const afterNewPool = await getPool('team_c');
    const afterNewCodes = Array.isArray(afterNewPool.freeCodes) ? afterNewPool.freeCodes.map(asInt).filter(v => v != null) : [];
    assertOk(!afterNewCodes.includes(beforeNewMax), 'team_c allocated code still present in pool');

    // History + adminActions increased
    const afterHistory = await listHistoryFor(staffKycUid);
    assertOk(afterHistory.length === beforeHistory.length + 1, 'Expected 1 new history entry for admin change');
    const afterActions = await listAdminActionsFor(staffKycUid);
    assertOk(afterActions.length === beforeActions.length + 1, 'Expected 1 new adminActions entry for changeUserTeam');
    const lastAction = afterActions[afterActions.length - 1];
    assertOk(lastAction.action === 'changeUserTeam', 'adminActions.action mismatch');
  });

  // ADMIN 9) Set status → users.status updated + adminActions entry
  await runItem('9) Admin set status (users.status + adminActions)', async () => {
    const beforeActions = await listAdminActionsFor(staffKycUid);
    await runCallable(
      'setUserStatus',
      { uid: staffKycUid, status: 'blocked' },
      { uid: adminUid, token: { email: 'admin@test.local', admin: true } },
    );
    const userSnap = await db.collection('users').doc(staffKycUid).get();
    const user = userSnap.data() || {};
    assertOk(user.status === 'blocked', 'users.status not updated to blocked');
    const afterActions = await listAdminActionsFor(staffKycUid);
    assertOk(afterActions.length === beforeActions.length + 1, 'Expected 1 new adminActions entry for setUserStatus');
    const last = afterActions[afterActions.length - 1];
    assertOk(last.action === 'setUserStatus', 'adminActions.action mismatch for setUserStatus');
  });

  const failed = results.filter(r => !r.ok);
  console.log('---');
  console.log(`[smoke] Summary: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.log('[smoke] Failures:');
    for (const f of failed) console.log(`- ${f.label}: ${f.error}`);
    process.exitCode = 1;
  } else {
    console.log('[smoke] ✅ All smoke items passed');
  }
}

main().catch(err => {
  console.error('[smoke] ❌ Fatal:', formatErr(err));
  process.exit(1);
});

