const fs = require('node:fs');

function assertEnv(name) {
  const v = (process.env[name] || '').toString().trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function assertWritableDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const p = `${dir}/.write_test_${Date.now()}`;
  fs.writeFileSync(p, 'ok');
  fs.unlinkSync(p);
}

function failFastConfig() {
  const nodeEnv = (process.env.NODE_ENV || '').toString();
  const isDev = nodeEnv === 'development';

  // In production we REQUIRE an explicit sessions path (mounted volume).
  const sessionsPath = (process.env.SESSIONS_PATH || '').toString().trim();
  if (!sessionsPath && !isDev) {
    throw new Error('SESSIONS_PATH is required in production (must be on persistent volume).');
  }

  if (sessionsPath) assertWritableDir(sessionsPath);

  // Firebase: either service account json or explicit vars.
  const sa = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').toString().trim();
  if (!sa) {
    assertEnv('FIREBASE_PROJECT_ID');
    assertEnv('FIREBASE_CLIENT_EMAIL');
    assertEnv('FIREBASE_PRIVATE_KEY');
  }

  // Media pipeline depends on Storage. If enabled, require bucket env (or fallback works) + credentials already checked.
  const mediaEnabled = (process.env.MEDIA_ENABLED || '').toString().trim() === '1';
  if (mediaEnabled) {
    // bucket can be inferred; do not force, but ensure we can init storage later.
  }

  return { sessionsPath: sessionsPath || null, mediaEnabled };
}

module.exports = {
  failFastConfig,
};

