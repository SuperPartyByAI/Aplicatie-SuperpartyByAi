import * as Sentry from '@sentry/react';

// Initialize Sentry for React
Sentry.init({
  dsn: 'https://36da450cdfd7b3789463ed5d709768c9@o4510447481520128.ingest.de.sentry.io/4510632428306512',

  environment: import.meta.env.MODE || 'development',

  // Performance Monitoring
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],

  // Performance
  tracesSampleRate: 1.0,

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Enable logs
  enableLogs: true,
});

export default Sentry;
