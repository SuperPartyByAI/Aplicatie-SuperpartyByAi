const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_ENV = 'FIREBASE_SERVICE_ACCOUNT_JSON';

const loadServiceAccount = () => {
  const raw = process.env[SERVICE_ACCOUNT_ENV];
  if (raw && raw.trim().length > 0) {
    return JSON.parse(raw);
  }

  const localPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(localPath)) {
    const rawFile = fs.readFileSync(localPath, 'utf8');
    return JSON.parse(rawFile);
  }

  return null;
};

const initFirebaseAdmin = () => {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error('FIRESTORE_DISABLED_MISSING_CREDENTIALS');
  }

  const projectId = serviceAccount.project_id || serviceAccount.projectId || null;
  if (!projectId) {
    throw new Error('FIRESTORE_DISABLED_MISSING_PROJECT_ID');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  return { admin, db: admin.firestore(), projectId };
};

module.exports = {
  admin,
  initFirebaseAdmin,
};
