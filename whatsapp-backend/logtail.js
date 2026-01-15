const { Logtail } = require('@logtail/node');

// Circuit breaker flag: disable Logtail permanently if unauthorized
let LOGTAIL_DISABLED = false;
let logtail = null;

// Initialize Logtail only if token is provided
const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN || process.env.BETTER_STACK_SOURCE_TOKEN;

if (LOGTAIL_SOURCE_TOKEN && LOGTAIL_SOURCE_TOKEN.trim() !== '' && !LOGTAIL_SOURCE_TOKEN.startsWith('#')) {
  try {
    logtail = new Logtail(LOGTAIL_SOURCE_TOKEN, {
      sendLogsToConsoleOutput: true,
    });
    console.log('✅ Logtail initialized (remote logging enabled)');
  } catch (error) {
    console.warn('⚠️ Logtail initialization failed:', error.message);
    LOGTAIL_DISABLED = true;
  }
} else {
  console.log('ℹ️ Logtail disabled: LOGTAIL_SOURCE_TOKEN not set or invalid');
  LOGTAIL_DISABLED = true;
}

// Helper to log with context (fail-open: never throw)
function log(level, message, context = {}) {
  const logData = {
    message,
    ...context,
    service: 'whatsapp-backend',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
  };

  // Always log to console
  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleMethod(`[${level.toUpperCase()}] ${message}`, context);

  // Try remote logging only if enabled and not disabled
  if (!LOGTAIL_DISABLED && logtail) {
    try {
      logtail[level](message, logData);
    } catch (error) {
      // If Unauthorized, disable permanently
      if (error.message && (error.message.includes('Unauthorized') || error.message.includes('401'))) {
        if (!LOGTAIL_DISABLED) {
          LOGTAIL_DISABLED = true;
          console.warn('⚠️ Logtail disabled: Unauthorized (remote logging stopped)');
        }
      } else {
        // Other errors: log once but don't spam
        console.error('Logtail error (non-fatal):', error.message);
      }
    }
  }
}

module.exports = {
  logtail: logtail || { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  debug: (msg, ctx) => log('debug', msg, ctx),
};
