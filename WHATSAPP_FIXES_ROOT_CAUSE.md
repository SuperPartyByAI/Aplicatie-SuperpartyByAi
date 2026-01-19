# WhatsApp Fixes - Root Cause Summary

## Root Causes Identified

### 1. QR Regeneration Spam Loop
**Root Cause:**
- Flutter UI has throttling (5s) but no cooldown after failures
- No check for "already in progress" status before calling regenerate
- Backend returns 500 on errors, triggering retry logic in Flutter
- Missing requestId correlation across layers

**Impact:** Infinite retry loop when backend fails

### 2. Connection Close Reason 515 (Stream Errored)
**Root Cause:**
- Firestore backup in `saveCreds` wrapper can throw errors
- Errors in backup don't kill socket directly, but connection.update events may not fire
- Reason 515 = "restart required" - socket needs recreation
- Backend correctly detects 515 but connection closes before QR can be scanned

**Impact:** QR generated but connection dies immediately, account disappears

### 3. PASSIVE Mode Handling
**Root Cause:**
- `checkPassiveModeGuard` function missing or not properly implemented
- Backend in PASSIVE mode but still attempts to create connections
- Regenerate QR endpoint doesn't check PASSIVE mode before attempting connection

**Impact:** 500 errors when backend can't acquire lock

### 4. Account Disappearing
**Root Cause:**
- Connection closes with reason 515 → account marked disconnected
- Account cleanup logic removes from memory
- No persistence check before cleanup
- Flutter polls getAccounts → sees 0 accounts

**Impact:** User sees account created then immediately disappears

### 5. Black Screen Issues
**Root Cause:**
- StreamBuilder/FutureBuilder may wait forever
- No timeout on auth stream
- No error handling in AuthGate

**Impact:** App shows black screen if auth stream hangs

### 6. Events Page Empty
**Root Cause:**
- Filters may exclude all events
- No logging of query params
- Empty state shown but no debug info

**Impact:** User sees "no events" but can't debug why

### 7. AI Rating Missing
**Root Cause:**
- Need to locate rating computation code
- No debug logging for prompt/response
- Failures not visible to user

**Impact:** Rating feature may be broken silently
