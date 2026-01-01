// Logtail disabled - token invalid
// Use console logging instead

function log(level, message, context = {}) {
  const logData = {
    message,
    ...context,
    service: 'kyc-app-frontend',
    environment: import.meta.env.MODE || 'production',
    timestamp: new Date().toISOString(),
  };

  console[level](`[${level.toUpperCase()}]`, message, logData);
}

export default {
  logtail: null,
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  debug: (msg, ctx) => log('log', msg, ctx),
};
