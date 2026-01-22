#!/usr/bin/env node

const fs = require('fs');

const fetchJson = async (url, headers = {}) => {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
};

const readEnvToken = () => {
  const envPath = '/etc/whatsapp-backend/env';
  try {
    if (!fs.existsSync(envPath)) return null;
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^DIAG_TOKEN=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
};

(async () => {
  const ts = new Date().toISOString();
  const token = process.env.DIAG_TOKEN || readEnvToken();
  if (token) {
    const diag = await fetchJson(`http://127.0.0.1:8080/diag/status?token=${encodeURIComponent(token)}`);
    if (diag.ok && diag.data) {
      console.log(
        JSON.stringify({
          accounts_total: diag.data.accounts_total ?? 0,
          connected: diag.data.connected ?? 0,
          session_present: Boolean(diag.data.session_present),
          last_inbound_at_ms: diag.data.last_inbound_at_ms ?? null,
          last_firestore_write_at_ms: diag.data.last_firestore_write_at_ms ?? null,
          last_error_sha8: diag.data.last_error_sha8 ?? null,
          ts: diag.data.ts || ts,
        })
      );
      process.exit(0);
    }
  }

  const health = await fetchJson('http://127.0.0.1:8080/health');
  if (health.ok && health.data) {
    console.log(
      JSON.stringify({
        accounts_total: health.data.accounts_total ?? 0,
        connected: health.data.connected ?? 0,
        session_present: (health.data.accounts_total ?? 0) > 0,
        last_inbound_at_ms: null,
        last_firestore_write_at_ms: null,
        last_error_sha8: null,
        ts,
      })
    );
    process.exit(0);
  }

  const dashboard = await fetchJson('http://127.0.0.1:8080/api/status/dashboard');
  if (dashboard.ok && dashboard.data) {
    console.log(
      JSON.stringify({
        accounts_total: dashboard.data.accounts_total ?? dashboard.data.total ?? 0,
        connected: dashboard.data.connected ?? 0,
        session_present: (dashboard.data.accounts_total ?? dashboard.data.total ?? 0) > 0,
        last_inbound_at_ms: null,
        last_firestore_write_at_ms: null,
        last_error_sha8: null,
        ts,
      })
    );
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      accounts_total: 0,
      connected: 0,
      session_present: false,
      last_inbound_at_ms: null,
      last_firestore_write_at_ms: null,
      last_error_sha8: null,
      ts,
    })
  );
  process.exit(1);
})();
