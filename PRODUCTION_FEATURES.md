# Production Features Documentation

## Overview

This document describes the production-ready features implemented in the SuperParty application.

---

## 🔍 Observability

### Sentry Error Tracking

**Setup:**

```bash
# Install
npm install @sentry/node @sentry/profiling-node

# Configure environment
SENTRY_DSN=your_sentry_dsn
SENTRY_ENVIRONMENT=production
```

**Usage in code:**

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'production',
  tracesSampleRate: 1.0,
});

// Errors are automatically captured
// Manual capture:
Sentry.captureException(new Error('Something went wrong'));
```

**Features:**

- Automatic error capture
- Source map support for stack traces
- Performance monitoring
- Release tracking

### Better Stack/Logtail Logging

**Setup:**

```bash
# Install
npm install @logtail/node @logtail/pino

# Configure environment
LOGTAIL_SOURCE_TOKEN=your_logtail_token
```

**Usage:**

```javascript
const { Logtail } = require('@logtail/node');
const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);

logtail.info('User logged in', { userId: '123' });
logtail.error('Payment failed', { orderId: '456', error: err.message });
```

**Features:**

- Centralized log aggregation
- Structured logging with context
- Real-time log streaming
- Advanced search and filtering

### Lighthouse CI

**Setup:**

```bash
# Install
npm install -g @lhci/cli

# Configure
# See .github/workflows/lighthouse.yml
```

**Features:**

- Automated performance audits on every PR
- Performance budget enforcement
- Accessibility checks
- SEO validation

---

## 🛠️ Code Quality

### ESLint

**Configuration:** `eslint.config.js` (flat config format)

**Run manually:**

```bash
npm run lint
npm run lint:fix
```

**Features:**

- Modern flat config format
- Automatic fixes for common issues
- Pre-commit hook integration

### Prettier

**Configuration:** `.prettierrc.json`

**Run manually:**

```bash
npm run format
npm run format:check
```

**Features:**

- Consistent code formatting
- Editor integration via EditorConfig
- Pre-commit hook integration

### Husky Pre-commit Hooks

**Setup:** Already configured in `.husky/pre-commit`

**What runs on commit:**

1. ESLint (lint)
2. Prettier (format check)
3. Jest (tests)

**Skip hooks (emergency only):**

```bash
git commit --no-verify -m "Emergency fix"
```

### EditorConfig

**Configuration:** `.editorconfig`

**Features:**

- Consistent formatting across editors (VS Code, IntelliJ, Vim, etc.)
- Automatic indentation and line endings
- No manual configuration needed

---

## 🧪 Testing

### Jest

**Configuration:** `jest.config.js`

**Run tests:**

```bash
npm test
npm run test:coverage
```

**Coverage thresholds:**

- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

**Example test:**

```javascript
const cache = require('./shared/cache');

describe('MemoryCache', () => {
  test('should set and get values', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });
});
```

---

## 🚀 Performance

### In-Memory Cache

**Location:** `shared/cache.js`

**Usage:**

```javascript
const cache = require('./shared/cache');

// Basic set/get
cache.set('key', 'value', 30000); // 30s TTL
const value = cache.get('key');

// getOrSet pattern (recommended)
const data = await cache.getOrSet(
  'users',
  async () => {
    return await fetchUsersFromDB();
  },
  60000
); // 60s TTL

// Check existence
if (cache.has('key')) {
  // ...
}

// Clear cache
cache.clear();
```

**Features:**

- TTL-based expiration
- Automatic cleanup
- getOrSet pattern for fetch-on-miss
- Memory-efficient

### Feature Flags

**Location:** `shared/feature-flags.js`

**Configuration:**

```bash
# Environment variables
FF_API_CACHING=true          # Enable/disable caching
FF_WHATSAPP_INTEGRATION=true # Enable/disable WhatsApp
FF_SENTRY_MONITORING=true    # Enable/disable Sentry
FF_LOGTAIL_LOGGING=true      # Enable/disable Logtail
FF_EXPERIMENTAL=false        # Enable experimental features
FF_CACHE_TTL=30              # Cache TTL in seconds
```

**Usage:**

```javascript
const { featureFlags, isEnabled } = require('./shared/feature-flags');

// Simple boolean check
if (isEnabled('API_CACHING')) {
  const cached = cache.get('data');
  if (cached) return cached;
}

// User-specific rollout (gradual release)
if (isEnabled('NEW_FEATURE', userId)) {
  // Show new feature to percentage of users
}

// Get configuration value
const ttl = featureFlags.CACHE_TTL * 1000;
```

**Features:**

- Runtime toggling without deployments
- User-specific rollout percentages
- Environment-based configuration
- No code changes needed to enable/disable features

---

## 📚 Documentation

### Swagger/OpenAPI

**Access:** Navigate to `/api-docs` on your server

**Example endpoint documentation:**

```javascript
/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: Get all WhatsApp accounts
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: List of accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 */
app.get('/api/accounts', async (req, res) => {
  // ...
});
```

**Features:**

- Interactive API testing
- Automatic schema generation
- Request/response examples
- Authentication documentation

### TypeScript

**Configuration:** `tsconfig.json`

**Type checking:**

```bash
npx tsc --noEmit
```

**Features:**

- Type safety for JavaScript files
- IntelliSense in editors
- Catch errors before runtime
- No migration required (allowJs: true)

---

## 🔐 Security

### Rate Limiting

**Configuration in code:**

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### Environment Variables

**Never commit:**

- API keys
- Database credentials
- Tokens
- Secrets

**Use `.env` file:**

```bash
cp .env.example .env
# Edit .env with your values
```

**Access in code:**

```javascript
const apiKey = process.env.API_KEY;
```

---

## 🚨 Alerting

### Slack/Discord Notifications

**Configuration:** `.github/workflows/notify.yml`

**Setup:**

```bash
# Add to GitHub Secrets
SLACK_WEBHOOK_URL=your_slack_webhook
DISCORD_WEBHOOK_URL=your_discord_webhook
```

**Triggers:**

- Deployment success/failure
- CI/CD pipeline status
- Performance degradation
- Error rate spikes

---

## 📊 Monitoring Dashboard

### Access Points

- **Sentry Dashboard**: [sentry.io](https://sentry.io)
- **Better Stack Logs**: [logs.betterstack.com](https://logs.betterstack.com)
- **Lighthouse Reports**: GitHub Actions artifacts
- **Swagger UI**: `https://your-domain.com/api-docs`

### Key Metrics

Monitor these metrics:

- Error rate (Sentry)
- Response time (Lighthouse)
- Cache hit rate (logs)
- API usage (rate limiter logs)
- Feature flag adoption (logs)

---

## 🔄 Deployment

### Pre-deployment Checklist

1. ✅ All tests passing (`npm test`)
2. ✅ Linting clean (`npm run lint`)
3. ✅ Formatting correct (`npm run format:check`)
4. ✅ Coverage above 80% (`npm run test:coverage`)
5. ✅ TypeScript checks pass (`npx tsc --noEmit`)
6. ✅ Environment variables configured
7. ✅ Feature flags set appropriately

### Deployment Commands

```bash
# Frontend (Firebase Hosting)
npm run deploy:frontend

# WhatsApp Functions (Firebase Functions)
npm run deploy:whatsapp

# WhatsApp Backend (legacy hosting)
npm run deploy:legacy hosting
```

---

## 🐛 Troubleshooting

### Cache Issues

```bash
# Clear cache
node -e "const cache = require('./shared/cache'); cache.clear();"
```

### Feature Flag Issues

```bash
# Check current flags
node -e "const ff = require('./shared/feature-flags'); console.log(ff.featureFlags);"

# Disable feature temporarily
FF_API_CACHING=false npm start
```

### Test Failures

```bash
# Run specific test
npm test -- cache.test.js

# Run with verbose output
npm test -- --verbose

# Update snapshots
npm test -- -u
```

---

## 📝 Best Practices

### Caching

- Use `getOrSet` pattern for automatic cache population
- Set appropriate TTL based on data freshness requirements
- Monitor cache hit rates
- Clear cache on data updates

### Feature Flags

- Start with feature disabled (`FF_FEATURE=false`)
- Test thoroughly before enabling
- Use gradual rollout for risky features
- Document flag purpose and expected behavior

### Error Handling

- Always capture errors to Sentry
- Include context (userId, requestId, etc.)
- Log errors to Logtail for debugging
- Return user-friendly error messages

### Testing

- Write tests for new features
- Maintain 80%+ coverage
- Test edge cases and error conditions
- Use descriptive test names

---

## 🔗 Related Documentation

- [README.md](./README.md) - Main documentation
- [CACHING_STRATEGY.md](./CACHING_STRATEGY.md) - Caching details
- [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Alerting configuration
- [UPTIME_MONITORING.md](./UPTIME_MONITORING.md) - Monitoring setup

---

## 📞 Support

For issues or questions:

1. Check this documentation
2. Review error logs in Sentry/Logtail
3. Check GitHub Actions for CI/CD issues
4. Review Swagger docs for API questions
