const admin = require('firebase-admin');

let _app = null;

function _parseServiceAccountJson() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (must be JSON).');
  }
}

function initFirebase() {
  if (_app) return _app;

  const sa = _parseServiceAccountJson();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    sa?.project_id ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;

  if (!projectId) {
    throw new Error(
      'Missing FIREBASE_PROJECT_ID (or FIREBASE_SERVICE_ACCOUNT_JSON.project_id).',
    );
  }

  let credential;
  if (sa) {
    credential = admin.credential.cert(sa);
  } else {
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').toString();
    if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
      throw new Error(
        'Missing Firebase service account env vars. Provide FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.',
      );
    }
    credential = admin.credential.cert({ projectId, clientEmail, privateKey });
  }

  _app = admin.initializeApp({
    credential,
    projectId,
  });

  return _app;
}

function getAdmin() {
  if (!_app) initFirebase();
  return admin;
}

function getDb() {
  if (!_app) initFirebase();
  const db = admin.firestore();
  // Recommended for Node: reduce latency spikes under load.
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

module.exports = {
  initFirebase,
  getAdmin,
  getDb,
};

