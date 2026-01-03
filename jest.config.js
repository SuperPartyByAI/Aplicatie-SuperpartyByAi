module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['monitoring/**/*.js', '!monitoring/**/*.test.js', '!**/node_modules/**'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/kyc-app/',
    '/functions/',
    '/whatsapp-backend/',
    '/voice-backend/',
    '/railway-monitor/',
    '/monitoring/',
    '/twilio-backend/',
  ],
  verbose: true,
};
