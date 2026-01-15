/**
 * Sets custom claim { admin: true } for a Firebase Auth user.
 *
 * Usage (requires GOOGLE_APPLICATION_CREDENTIALS):
 *   node tools/set_admin_claim.js --project <projectId> --uid <uid>
 *
 * Notes:
 * - This is the preferred admin mechanism.
 * - After setting claims, the user must re-login or refresh token.
 */

const fs = require('node:fs');
const path = require('node:path');

function loadAdminSdk() {
  try {
    // Use functions/node_modules
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
  } catch (_) {
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

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

async function main() {
  const projectId = (argValue('--project') || readDefaultProjectId() || '').trim();
  const uid = (argValue('--uid') || '').trim();
  const email = (argValue('--email') || '').trim();

  if (!projectId) {
    console.error('Missing projectId. Use --project <id> or ensure .firebaserc exists.');
    process.exit(1);
  }
  if (!uid && !email) {
    console.error('Missing uid or email. Use --uid <uid> OR --email <email>.');
    process.exit(1);
  }

  const admin = loadAdminSdk();
  if (!admin.apps.length) {
    admin.initializeApp({ projectId });
  }

  let targetUid = uid;
  if (!targetUid && email) {
    // Lookup user by email
    try {
      const user = await admin.auth().getUserByEmail(email);
      targetUid = user.uid;
      console.log(`[admin-claim] Found user: email=${email} -> uid=${targetUid}`);
    } catch (e) {
      console.error(`[admin-claim] ❌ User not found for email: ${email}`);
      process.exit(1);
    }
  }

  await admin.auth().setCustomUserClaims(targetUid, { admin: true });
  console.log(`[admin-claim] ✅ Set admin:true for uid=${targetUid} (project=${projectId})`);
  console.log('[admin-claim] User must re-login / refresh token to receive claims.');
}

main().catch(err => {
  console.error('[admin-claim] ❌ Failed:', err);
  process.exit(1);
});

