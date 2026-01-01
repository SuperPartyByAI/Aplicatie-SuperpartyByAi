import { Logtail } from '@logtail/browser';

// Initialize Logtail for Browser
const logtail = new Logtail('#token-global-51540');

// Helper to log with context
function log(level, message, context = {}) {
  const logData = {
    message,
    ...context,
    service: 'kyc-app-frontend',
    environment: import.meta.env.MODE || 'production',
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };

  logtail[level](message, logData);
}

export default {
  logtail,
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  debug: (msg, ctx) => log('debug', msg, ctx),
};
