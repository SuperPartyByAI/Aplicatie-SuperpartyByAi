const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_ENV = 'FIREBASE_SERVICE_ACCOUNT_JSON';

const decodeSystemdValue = (value) => {
  let raw = String(value || '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  raw = raw.replace(/\\\\/g, '\\');
  raw = raw.replace(/\\n/g, '\n');
  raw = raw.replace(/\\"/g, '"');
  return raw.trim();
};

const readSystemdEnv = () => {
  const candidates = [
    '/etc/systemd/system/whatsapp-backend.service.d/10-firebase-creds.conf',
    '/etc/systemd/system/whatsapp-backend.service.d/15-firebase-env.conf',
    '/etc/systemd/system/whatsapp-backend.service.d/override.conf',
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes(SERVICE_ACCOUNT_ENV)) continue;
      const idx = line.indexOf(`${SERVICE_ACCOUNT_ENV}=`);
      if (idx === -1) continue;
      const rawValue = line.slice(idx + SERVICE_ACCOUNT_ENV.length + 1);
      const decoded = decodeSystemdValue(rawValue);
      if (decoded) return decoded;
    }
  }

  return '';
};

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

  const systemdRaw = readSystemdEnv();
  if (systemdRaw) {
    return JSON.parse(systemdRaw);
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
