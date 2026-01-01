const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// Initialize Sentry for Firebase Functions
Sentry.init({
  dsn: 'https://36da450cdfd7b3789463ed5d709768c9@o4510447481520128.ingest.de.sentry.io/4510632428306512',

  environment: process.env.NODE_ENV || 'production',

  // Performance Monitoring
  tracesSampleRate: 1.0,

  // Profiling
  profilesSampleRate: 1.0,

  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleIntegration({ levels: ['warn', 'error'] }),
  ],

  // Enable logs
  enableLogs: true,

  // Add Firebase context
  beforeSend(event) {
    // Add Firebase Function context
    if (process.env.FUNCTION_NAME) {
      event.tags = event.tags || {};
      event.tags.function_name = process.env.FUNCTION_NAME;
    }
    return event;
  },
});

// Export logger
const { logger } = Sentry;

module.exports = { Sentry, logger };
