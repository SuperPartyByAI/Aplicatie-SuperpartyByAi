const { Logtail } = require('@logtail/node');

// Initialize Logtail for Firebase Functions
const logtail = new Logtail('#token-global-51540', {
  sendLogsToConsoleOutput: true
});

// Helper to log with context
function log(level, message, context = {}) {
  const logData = {
    message,
    ...context,
    service: 'firebase-functions',
    function: process.env.FUNCTION_NAME || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logtail[level](message, logData);
}

module.exports = {
  logtail,
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  debug: (msg, ctx) => log('debug', msg, ctx)
};
