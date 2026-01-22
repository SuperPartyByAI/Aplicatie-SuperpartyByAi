#!/usr/bin/env node

const fetchJson = async (url) => {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
};

(async () => {
  const ts = new Date().toISOString();
  const health = await fetchJson('http://127.0.0.1:8080/health');
  if (health.ok && health.data) {
    console.log(
      JSON.stringify({
        accounts_total: health.data.accounts_total ?? 0,
        connected: health.data.connected ?? 0,
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
        ts,
      })
    );
    process.exit(0);
  }

  console.log(JSON.stringify({ accounts_total: 0, connected: 0, ts }));
  process.exit(1);
})();
