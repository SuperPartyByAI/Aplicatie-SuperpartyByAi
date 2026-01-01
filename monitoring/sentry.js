const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// Initialize Sentry
Sentry.init({
  dsn: 'https://36da450cdfd7b3789463ed5d709768c9@o4510447481520128.ingest.de.sentry.io/4510632428306512',

  environment: process.env.NODE_ENV || 'development',

  // Performance Monitoring
  tracesSampleRate: 1.0,

  // Profiling
  profilesSampleRate: 1.0,

  integrations: [
    nodeProfilingIntegration(),
    // Console logging integration
    Sentry.consoleIntegration({ levels: ['error'] }),
  ],

  // Enable logs
  enableLogs: true,
});

// Export logger
const { logger } = Sentry;

module.exports = { Sentry, logger };
