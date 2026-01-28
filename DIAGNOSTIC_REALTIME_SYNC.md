# WhatsApp Real-Time Sync Diagnostic & Fix

## Findings

### Evidence from Production Logs
1. **Backend is running**: Service active, Firestore available, DB exists
2. **Messages are being received**: `📨 Processing X message(s) in real-time` appears
3. **Only protocol messages**: All processed messages are `protocolMessage` (historySyncNotification, type=5)
4. **No real text messages**: Zero messages with `hasConversation=true` or `hasExtendedText=true` in last 30 minutes
5. **Protocol messages correctly skipped**: `⏭️ Skipping protocol message` - this is expected
6. **Missing "💾 Attempting to save"**: No real messages reach the save step

### Root Cause
**Bucket A: Backend receives WhatsApp events but ONLY protocol/sync signals, not real text messages**

The WhatsApp session appears to be in a degraded state where:
- Connection is "connected" (health shows connected accounts)
- Protocol messages (historySyncNotification) are received
- Real text messages are NOT being received from WhatsApp

This is a **session state issue** - the Baileys socket is connected but not receiving real message events.

## Fix

### 1. Add Connection Health Check & Reconnect Logic

Add periodic health check that verifies real messages are flowing, not just protocol messages.

**File**: `whatsapp-backend/server.js`

Add after line ~820 (after listener attachment):

```javascript
// Health check: verify real messages are flowing (not just protocol)
let lastRealMessageTime = new Map(); // accountId -> timestamp
const REAL_MESSAGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  for (const [accountId, sock] of connections.entries()) {
    if (!sock || connections.get(accountId)?.status !== 'connected') continue;
    
    const lastReal = lastRealMessageTime.get(accountId) || 0;
    const timeSinceLastReal = Date.now() - lastReal;
    
    if (timeSinceLastReal > REAL_MESSAGE_TIMEOUT_MS && lastReal > 0) {
      console.warn(`⚠️  [${hashForLog(accountId)}] No real messages received in ${Math.floor(timeSinceLastReal / 1000)}s - session may be degraded`);
      // Optionally trigger reconnection check
    }
  }
}, 60000); // Check every minute
```

### 2. Track Real Messages (Not Protocol)

Update `handleMessagesUpsert` to track when real messages (not protocol) are received:

**File**: `whatsapp-backend/server.js`

After line ~1911 (after `if (saved)`):

```javascript
if (saved && !isProtocolHistorySync(msg)) {
  // Track real message receipt time for health check
  lastRealMessageTime.set(accountId, Date.now());
}
```

### 3. Add Explicit Reconnection Trigger

Add endpoint to force reconnection check:

**File**: `whatsapp-backend/server.js`

Add route (around line ~2500):

```javascript
app.post('/api/whatsapp/accounts/:accountId/reconnect', async (req, res) => {
  const { accountId } = req.params;
  const account = connections.get(accountId);
  
  if (!account || !account.sock) {
    return res.status(404).json({ error: 'Account not found or not connected' });
  }
  
  try {
    // Force reconnection by closing and reinitializing
    await account.sock.end();
    connections.delete(accountId);
    
    // Reinitialize connection
    await initializeAccount(accountId);
    
    res.json({ success: true, message: 'Reconnection triggered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 4. Improve Logging for Real vs Protocol Messages

**File**: `whatsapp-backend/server.js`

Update line ~1689 to show real message count:

```javascript
const realMessageCount = newMessages.filter(msg => !isProtocolHistorySync(msg)).length;
const protocolCount = newMessages.length - realMessageCount;

console.log(
  `🔍 [${hashForLog(accountId)}] BATCH DEBUG: type=${type} total=${newMessages.length} real=${realMessageCount} protocol=${protocolCount} messageTypes=[${messageTypes.join('|')}]`
);
```

## Deploy Steps

### Backend (Hetzner)

```bash
# 1. Pull latest code
cd /opt/whatsapp/Aplicatie-SuperpartyByAi
git fetch origin
git checkout fix/whatsapp-improvements-20260127
git pull origin fix/whatsapp-improvements-20260127

# 2. Install dependencies (if needed)
cd whatsapp-backend
npm ci

# 3. Restart service
sudo systemctl restart whatsapp-backend

# 4. Verify
sudo systemctl status whatsapp-backend --no-pager -l | head -20
sleep 5
curl -s http://localhost:8080/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('connected:', d.get('connected'))"
```

### Flutter (No changes needed for this fix)

## Verification

### Test Real Message Flow

1. **Send test message**: Send "test-realtime-123" from phone to personal account
2. **Check backend logs** (within 30s):
   ```bash
   sudo journalctl -u whatsapp-backend --since "1 min ago" -f | grep -E "📨|📩|💾|✅.*Message saved|real=|protocol="
   ```
   
   **Expected output**:
   ```
   📨 Processing 1 message(s) in real-time (type=notify)
   🔍 BATCH DEBUG: type=notify total=1 real=1 protocol=0
   📩 Processing message: ... type=text (or conversation)
   💾 Attempting to save message: ...
   ✅ Message saved successfully: ...
   ```

3. **Check Firestore** (within 60s):
   - Collection: `threads/{threadId}/messages`
   - Should see new message doc with `body="test-realtime-123"`
   - Thread `lastMessageAtMs` should update

4. **Check Flutter app**:
   - Personal inbox: Thread should show "test-realtime-123" as last message
   - Thread stream update should show increased count
   - `lastMessageAtMs` should be recent timestamp

### If Still Not Working

If only protocol messages appear:
1. **Session is degraded** → Regenerate QR and re-pair
2. **Check connection.update events**: Look for errors or disconnects
3. **Force reconnection**: Use `/api/whatsapp/accounts/{accountId}/reconnect` endpoint

## Next Steps if Issue Persists

If real messages still don't appear after fix:
1. Check Baileys version compatibility
2. Verify WhatsApp session is not rate-limited
3. Check for Baileys library bugs with recent WhatsApp protocol changes
4. Consider implementing message polling fallback if real-time events fail
