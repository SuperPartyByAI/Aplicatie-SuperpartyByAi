const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['type', 'project_id', 'private_key', 'client_email'];

function normalizeServiceAccount(serviceAccount) {
  if (serviceAccount && typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  return serviceAccount;
}

function validateServiceAccount(serviceAccount) {
  if (!serviceAccount || typeof serviceAccount !== 'object') {
    return { ok: false, error: 'Service account is empty or not an object.' };
  }
  const missing = REQUIRED_FIELDS.filter((field) => !serviceAccount[field]);
  if (missing.length > 0) {
    return { ok: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  return { ok: true };
}

function tryParseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function tryParseBase64(raw) {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return tryParseJson(decoded);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function tryParseFromPath(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return tryParseJson(raw);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function looksLikePath(value) {
  if (!value) return false;
  if (value.startsWith('/')) return true;
  if (value.endsWith('.json')) return true;
  return fs.existsSync(value);
}

function loadServiceAccount() {
  const attempts = [];

  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (envPath) {
    attempts.push(`FIREBASE_SERVICE_ACCOUNT_PATH:${envPath}`);
    const parsed = tryParseFromPath(envPath);
    if (parsed.ok) {
      const normalized = normalizeServiceAccount(parsed.value);
      const validation = validateServiceAccount(normalized);
      if (validation.ok) {
        return { serviceAccount: normalized, sourceLabel: 'FIREBASE_SERVICE_ACCOUNT_PATH', attempts };
      }
      attempts.push(`FIREBASE_SERVICE_ACCOUNT_PATH invalid: ${validation.error}`);
    } else {
      attempts.push(`FIREBASE_SERVICE_ACCOUNT_PATH parse error: ${parsed.error}`);
    }
  }

  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    const raw = envJson.trim();
    if (looksLikePath(raw)) {
      attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON:path:${raw}`);
      const parsed = tryParseFromPath(raw);
      if (parsed.ok) {
        const normalized = normalizeServiceAccount(parsed.value);
        const validation = validateServiceAccount(normalized);
        if (validation.ok) {
          return { serviceAccount: normalized, sourceLabel: 'FIREBASE_SERVICE_ACCOUNT_JSON:path', attempts };
        }
        attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON path invalid: ${validation.error}`);
      } else {
        attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON path parse error: ${parsed.error}`);
      }
    } else {
      attempts.push('FIREBASE_SERVICE_ACCOUNT_JSON:inline');
      const parsedJson = tryParseJson(raw);
      if (parsedJson.ok) {
        const normalized = normalizeServiceAccount(parsedJson.value);
        const validation = validateServiceAccount(normalized);
        if (validation.ok) {
          return { serviceAccount: normalized, sourceLabel: 'FIREBASE_SERVICE_ACCOUNT_JSON:json', attempts };
        }
        attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON json invalid: ${validation.error}`);
      } else {
        const parsedBase64 = tryParseBase64(raw);
        if (parsedBase64.ok) {
          const normalized = normalizeServiceAccount(parsedBase64.value);
          const validation = validateServiceAccount(normalized);
          if (validation.ok) {
            return { serviceAccount: normalized, sourceLabel: 'FIREBASE_SERVICE_ACCOUNT_JSON:base64', attempts };
          }
          attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON base64 invalid: ${validation.error}`);
        } else {
          attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON parse error: ${parsedJson.error}`);
          attempts.push(`FIREBASE_SERVICE_ACCOUNT_JSON base64 error: ${parsedBase64.error}`);
        }
      }
    }
  }

  const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleCreds) {
    attempts.push(`GOOGLE_APPLICATION_CREDENTIALS:${googleCreds}`);
    const parsed = tryParseFromPath(googleCreds);
    if (parsed.ok) {
      const normalized = normalizeServiceAccount(parsed.value);
      const validation = validateServiceAccount(normalized);
      if (validation.ok) {
        return { serviceAccount: normalized, sourceLabel: 'GOOGLE_APPLICATION_CREDENTIALS', attempts };
      }
      attempts.push(`GOOGLE_APPLICATION_CREDENTIALS invalid: ${validation.error}`);
    } else {
      attempts.push(`GOOGLE_APPLICATION_CREDENTIALS parse error: ${parsed.error}`);
    }
  }

  const fallbackPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(fallbackPath)) {
    attempts.push(`serviceAccountKey.json:${fallbackPath}`);
    const parsed = tryParseFromPath(fallbackPath);
    if (parsed.ok) {
      const normalized = normalizeServiceAccount(parsed.value);
      const validation = validateServiceAccount(normalized);
      if (validation.ok) {
        return { serviceAccount: normalized, sourceLabel: 'serviceAccountKey.json', attempts };
      }
      attempts.push(`serviceAccountKey.json invalid: ${validation.error}`);
    } else {
      attempts.push(`serviceAccountKey.json parse error: ${parsed.error}`);
    }
  } else {
    attempts.push('serviceAccountKey.json not found');
  }

  return { serviceAccount: null, sourceLabel: null, attempts };
}

module.exports = {
  loadServiceAccount,
};
