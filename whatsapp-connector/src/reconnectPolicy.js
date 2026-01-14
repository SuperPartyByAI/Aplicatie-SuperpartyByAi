function jitter(ms, pct = 0.2) {
  const delta = ms * pct;
  const r = (Math.random() * 2 - 1) * delta;
  return Math.max(250, Math.floor(ms + r));
}

function computeReconnectDelayMs({ attempt }) {
  // Fast first reconnects, then exponential backoff up to ~30s.
  const base = attempt <= 1 ? 1000 : attempt === 2 ? 2000 : 3000;
  const exp = Math.min(30000, Math.floor(base * Math.pow(1.7, Math.max(0, attempt - 2))));
  return jitter(exp, 0.25);
}

module.exports = {
  computeReconnectDelayMs,
};

