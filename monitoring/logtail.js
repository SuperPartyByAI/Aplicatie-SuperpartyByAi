const { Logtail } = require('@logtail/node');
const { LogtailTransport } = require('@logtail/pino');
const pino = require('pino');

// Initialize Logtail
const logtail = new Logtail('#token-global-51540');

// Create Pino logger with Logtail transport
const logger = pino({
  level: 'info',
  transport: {
    targets: [
      // Console output
      {
        target: 'pino-pretty',
        level: 'info',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
      // Logtail output
      {
        target: '@logtail/pino',
        level: 'info',
        options: {
          logtail,
        },
      },
    ],
  },
});

module.exports = { logtail, logger };
