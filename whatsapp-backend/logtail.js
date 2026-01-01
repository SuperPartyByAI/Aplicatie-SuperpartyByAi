const { Logtail } = require('@logtail/node');

// Initialize Logtail for WhatsApp Backend
const logtail = new Logtail('#token-global-51540', {
  sendLogsToConsoleOutput: true,
});

// Helper to log with context
function log(level, message, context = {}) {
  const logData = {
    message,
    ...context,
    service: 'whatsapp-backend',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
  };

  logtail[level](message, logData);
}

module.exports = {
  logtail,
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  debug: (msg, ctx) => log('debug', msg, ctx),
};
