const admin = require('firebase-admin');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_ENV = 'FIREBASE_SERVICE_ACCOUNT_JSON';
const BACKEND_CMD_MATCH = '/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend/server.js';

const sha8 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);

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

const findBackendPid = () => {
  try {
    const entries = fs.readdirSync('/proc');
    for (const name of entries) {
      if (!/^\d+$/.test(name)) continue;
      const cmdlinePath = path.join('/proc', name, 'cmdline');
      let cmdline = '';
      try {
        cmdline = fs.readFileSync(cmdlinePath, 'utf8');
      } catch (_) {
        continue;
      }
      if (cmdline.includes(BACKEND_CMD_MATCH)) {
        return name;
      }
    }
  } catch (_) {
    // ignore
  }
  return null;
};

const readBackendEnv = () => {
  const pid = findBackendPid();
  if (!pid) {
    return { value: '', found: false, len: 0, sha: null };
  }
  const envPath = path.join('/proc', pid, 'environ');
  try {
    const raw = fs.readFileSync(envPath);
    const entries = raw.toString('utf8').split('\0');
    for (const entry of entries) {
      if (!entry.startsWith(`${SERVICE_ACCOUNT_ENV}=`)) continue;
      const value = entry.slice(SERVICE_ACCOUNT_ENV.length + 1);
      const trimmed = String(value || '');
      return {
        value: trimmed,
        found: trimmed.length > 0,
        len: trimmed.length,
        sha: trimmed.length > 0 ? sha8(trimmed) : null,
      };
    }
  } catch (_) {
    // ignore
  }
  return { value: '', found: false, len: 0, sha: null };
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

  const backendEnv = readBackendEnv();
  if (backendEnv.found) {
    process.env[SERVICE_ACCOUNT_ENV] = backendEnv.value;
    return JSON.parse(backendEnv.value);
  }

  return null;
};

const initFirebaseAdmin = () => {
  const serviceAccount = loadServiceAccount();
  if (serviceAccount) {
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
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
    const projectId =
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.PROJECT_ID ||
      null;
    if (!projectId) {
      throw new Error('FIRESTORE_DISABLED_MISSING_PROJECT_ID');
    }
    return { admin, db: admin.firestore(), projectId };
  } catch (_) {
    throw new Error('FIRESTORE_DISABLED_MISSING_CREDENTIALS');
  }
};

module.exports = {
  admin,
  initFirebaseAdmin,
};
