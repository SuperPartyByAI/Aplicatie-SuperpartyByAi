const Sentry = require('@sentry/node');

// Cloud Run / Gen2: profiling can cause "failed to start and listen on PORT=8080"
const isCloudRun = !!(process.env.K_SERVICE || process.env.FUNCTION_TARGET);
const useProfiling = !isCloudRun;

const integrations = [Sentry.consoleIntegration({ levels: ['warn', 'error'] })];
if (useProfiling) {
  try {
    const { nodeProfilingIntegration } = require('@sentry/profiling-node');
    integrations.push(nodeProfilingIntegration());
  } catch (e) {
    console.warn('[sentry] Profiling skipped:', e?.message || e);
  }
}

try {
  Sentry.init({
    dsn: 'https://36da450cdfd7b3789463ed5d709768c9@o4510447481520128.ingest.de.sentry.io/4510632428306512',
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 1.0,
    profilesSampleRate: useProfiling ? 1.0 : 0,
    integrations,
    enableLogs: true,
    beforeSend(event) {
      if (process.env.FUNCTION_NAME) {
        event.tags = event.tags || {};
        event.tags.function_name = process.env.FUNCTION_NAME;
      }
      return event;
    },
  });
} catch (e) {
  console.warn('[sentry] Init failed (non-fatal):', e?.message || e);
}

const { logger } = Sentry;
module.exports = { Sentry, logger };
