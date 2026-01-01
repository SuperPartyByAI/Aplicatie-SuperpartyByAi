# 🔧 WhatsApp Configuration - SuperParty

## Firebase Configuration

### Project Details

```json
{
  "projectId": "superparty-frontend",
  "region": "us-central1",
  "functionName": "whatsapp",
  "runtime": "nodejs20",
  "generation": "1st Gen"
}
```

### URLs

```
Production: https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp
Health Check: https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/
API Base: https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api
```

---

## Dependencies (package.json)

```json
{
  "name": "superparty-whatsapp-functions",
  "version": "5.0.0",
  "engines": {
    "node": "20"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.5.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "socket.io": "^4.6.1",
    "firebase-admin": "^11.11.0",
    "firebase-functions": "^4.5.0",
    "qrcode": "^1.5.3",
    "pino": "^8.16.2",
    "libphonenumber-js": "^1.10.51",
    "socks-proxy-agent": "^8.0.2",
    "https-proxy-agent": "^7.0.2"
  }
}
```

---

## Environment Variables

### Firebase Functions (nu necesită .env)

```bash
# Toate configurările sunt în firebase.json și .firebaserc
# Firebase Admin SDK se autentifică automat în Cloud Functions
```

### Local Development (opțional)

```bash
# .env (dacă rulezi local)
FIREBASE_PROJECT_ID=superparty-frontend
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

---

## Firestore Collections

### whatsapp_sessions

```javascript
{
  "accountId": "account_1766951966844",
  "name": "SuperParty Main",
  "status": "connected",
  "phone": "40373805828",
  "qrCode": null,
  "pairingCode": null,
  "createdAt": "2025-12-28T19:59:26.844Z",
  "updatedAt": "2025-12-28T20:00:15.123Z",
  "sessionData": {
    // Baileys auth state
  }
}
```

### whatsapp_messages (opțional)

```javascript
{
  "accountId": "account_xxx",
  "to": "40373805828",
  "message": "Text",
  "status": "sent",
  "timestamp": "2025-12-28T20:00:00.000Z"
}
```

---

## Baileys Configuration

### Socket Options

```javascript
{
  auth: state,
  printQRInTerminal: false,
  browser: ['SuperParty', 'Chrome', '1.0.0'],
  logger: pino({ level: 'silent' }),
  connectTimeoutMs: 60000,
  defaultQueryTimeoutMs: 60000,
  keepAliveIntervalMs: 10000,
  retryRequestDelayMs: 250,
  maxMsgRetryCount: 5,
  getMessage: async (key) => {
    // Message retrieval logic
  }
}
```

---

## Rate Limits

### WhatsApp Limits (estimat)

```
Messages per second: ~1-2
Messages per minute: ~60
Messages per hour: ~1000
Messages per day: ~10000
```

### Implemented Limits

```javascript
{
  minDelay: 2000,        // 2 seconds between messages
  maxDelay: 5000,        // 5 seconds max delay
  burstLimit: 5,         // Max 5 messages in burst
  burstWindow: 60000     // 1 minute window
}
```

---

## Session Storage

### Local (Development)

```
Path: .baileys_auth/
Structure:
  .baileys_auth/
    account_xxx/
      creds.json
      app-state-sync-key-xxx.json
      app-state-sync-version-xxx.json
```

### Cloud (Production)

```
Firestore: whatsapp_sessions collection
Cloud Storage: gs://superparty-frontend.appspot.com/whatsapp-sessions/
```

---

## Monitoring & Logging

### Firebase Console

```
URL: https://console.firebase.google.com/project/superparty-frontend/functions
Logs: https://console.firebase.google.com/project/superparty-frontend/logs
```

### Log Levels

```javascript
{
  error: 'Connection failures, send errors',
  warn: 'Rate limits, reconnects',
  info: 'Connections, disconnections',
  debug: 'QR codes, pairing codes'
}
```

---

## Security

### CORS Configuration

```javascript
{
  origin: true,  // Allow all origins (adjust for production)
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
}
```

### Authentication (TODO)

```javascript
// Add Firebase Auth middleware
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

---

## Backup & Recovery

### Session Backup

```javascript
// Auto-backup every 5 minutes
setInterval(async () => {
  for (const [accountId, account] of this.accounts) {
    await sessionStore.saveSession(accountId, sessionPath, account);
  }
}, 300000);
```

### Recovery on Restart

```javascript
// Auto-restore on Cloud Function cold start
async autoRestoreSessions() {
  const sessions = await sessionStore.getAllSessions();
  for (const session of sessions) {
    if (session.status === 'connected') {
      await this.connectBaileys(session.accountId, session.phone);
    }
  }
}
```

---

## Performance Optimization

### Connection Pooling

```javascript
{
  maxAccounts: 20,
  keepAliveInterval: 10000,
  reconnectDelay: 1000,
  healthCheckInterval: 30000
}
```

### Message Queue

```javascript
{
  batchSize: 10,
  batchInterval: 5000,
  maxRetries: 3,
  retryDelay: 5000
}
```

---

## Testing

### Local Testing

```bash
# Start emulator
firebase emulators:start --only functions

# Test endpoint
curl http://localhost:5001/superparty-frontend/us-central1/whatsapp/
```

### Production Testing

```bash
# Health check
curl https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/

# Create account
curl -X POST https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp/api/whatsapp/add-account \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}'
```

---

## Troubleshooting Commands

### Check Function Status

```bash
firebase functions:list
```

### View Logs

```bash
firebase functions:log --only whatsapp
firebase functions:log --only whatsapp --follow
```

### Redeploy

```bash
firebase deploy --only functions:whatsapp
```

### Delete Function

```bash
firebase functions:delete whatsapp
```

---

## Cost Estimation

### Firebase Functions (Gen 1)

```
Invocations: Free tier 2M/month
Compute time: Free tier 400,000 GB-seconds/month
Network egress: Free tier 5GB/month

Estimated cost for 10,000 messages/day: ~$0-5/month
```

### Firestore

```
Reads: Free tier 50,000/day
Writes: Free tier 20,000/day
Storage: Free tier 1GB

Estimated cost: ~$0-1/month
```

### Total Estimated Cost

```
Development: $0/month (free tier)
Production (low volume): $5-10/month
Production (high volume): $20-50/month
```

---

## Migration to Gen 2 (Future)

### Benefits

- Longer timeout (540s vs 60s)
- Better cold start performance
- More memory options
- Better scaling

### Migration Steps

```javascript
// Change in index.js
const { onRequest } = require('firebase-functions/v2/https');

exports.whatsapp = onRequest(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 10,
  },
  app
);
```

---

**Ultima actualizare:** 2025-12-28  
**Versiune:** 5.0.0
