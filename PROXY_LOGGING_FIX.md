# Proxy Logging Fix - Non-2xx Response Details

## Problema Identificată

**Symptom:** Flutter primește erori 500 generice "Backend service returned an error" fără detalii.

**Root Cause:**
- Firebase Functions proxy primește răspunsuri non-2xx de la Railway
- Proxy-ul maschează erorile ca 500 generic
- Proxy-ul loghează doar `statusCode` și `errorId` (scurt), nu body-ul complet
- Detaliile reale sunt în Railway logs, dar nu sunt vizibile în Functions logs

**Impact:**
- Debugging dificil - nu știi de ce Railway returnează non-2xx
- Trebuie să corelezi manual requestId între Flutter → Functions → Railway
- Mesajele de eroare sunt generice și nu ajută la debugging

---

## Fix Aplicat

### Enhanced Logging în Proxy
**File:** `functions/whatsappProxy.js:915-959`

**Modificări:**
1. ✅ Loghează body-ul complet al răspunsului Railway pentru non-2xx (până la 500 chars)
2. ✅ Loghează detalii structurate: `error`, `message`, `status`, `accountId`
3. ✅ Include detalii Railway în response către Flutter (pentru debugging)

**Before:**
```javascript
console.error(`[whatsappProxy/regenerateQr] Railway error: status=${response.statusCode}, errorId=${shortErrorId}, requestId=${requestId}`);
```

**After:**
```javascript
// CRITICAL: Log full Railway response body for non-2xx to diagnose root cause
const railwayBody = response.body || {};
const railwayBodyStr = typeof railwayBody === 'string' 
  ? railwayBody 
  : JSON.stringify(railwayBody);
const railwayBodyPreview = railwayBodyStr.length > 500 
  ? railwayBodyStr.substring(0, 500) + '...' 
  : railwayBodyStr;

console.error(`[whatsappProxy/regenerateQr] Railway error (non-2xx): status=${response.statusCode}, requestId=${requestId}`);
console.error(`[whatsappProxy/regenerateQr] Railway error body: ${railwayBodyPreview}`);
console.error(`[whatsappProxy/regenerateQr] Railway error details: error=${railwayBody.error || 'none'}, message=${railwayBody.message || 'none'}, status=${railwayBody.status || 'none'}, accountId=${railwayBody.accountId || 'none'}`);
```

**Response Enhancement:**
```javascript
// Include Railway error details for debugging (not just generic message)
return res.status(httpStatus >= 400 && httpStatus < 500 ? httpStatus : 500).json({
  success: false,
  error: `UPSTREAM_HTTP_${httpStatus}`,
  message: response.body?.message || `Backend service returned an error (status: ${httpStatus})`,
  requestId: requestId,
  hint: `Check Railway logs for requestId: ${requestId}`,
  // Include Railway error code and status for debugging
  ...(response.body && typeof response.body === 'object' ? {
    backendError: response.body.error || response.body.errorCode,
    backendStatus: response.body.status,
    backendMessage: response.body.message,
    backendAccountId: response.body.accountId,
  } : {}),
});
```

---

## Beneficii

### 1. Debugging Mai Ușor
**Before:**
```
[whatsappProxy/regenerateQr] Railway error: status=500, errorId=unknown, requestId=req_123
```

**After:**
```
[whatsappProxy/regenerateQr] Railway error (non-2xx): status=500, requestId=req_123
[whatsappProxy/regenerateQr] Railway error body: {"success":false,"error":"internal_error","message":"Connection already in progress","accountId":"account_xxx","requestId":"req_123"}
[whatsappProxy/regenerateQr] Railway error details: error=internal_error, message=Connection already in progress, status=undefined, accountId=account_xxx
```

### 2. Flutter Primește Detalii
**Before:**
```json
{
  "success": false,
  "error": "UPSTREAM_HTTP_500",
  "message": "Backend service returned an error (status: 500)",
  "requestId": "req_123"
}
```

**After:**
```json
{
  "success": false,
  "error": "UPSTREAM_HTTP_500",
  "message": "Backend service returned an error (status: 500)",
  "requestId": "req_123",
  "backendError": "internal_error",
  "backendStatus": "already_in_progress",
  "backendMessage": "Connection already in progress",
  "backendAccountId": "account_xxx"
}
```

### 3. Corelare RequestId
- Flutter generează `requestId` și îl trimite la proxy
- Proxy forward-ează `requestId` la Railway
- Toate logs includ `requestId` pentru corelare end-to-end

---

## Teste

### Test 1: Verifică Logging în Functions
```bash
# 1. Trigger regenerateQr care returnează 500
# 2. Verifică Functions logs:
# Expected: [whatsappProxy/regenerateQr] Railway error body: {...}
# Expected: [whatsappProxy/regenerateQr] Railway error details: error=..., message=...
```

### Test 2: Verifică Response în Flutter
```bash
# 1. Trigger regenerateQr care returnează 500
# 2. Verifică Flutter logs:
# Expected: [WhatsAppApiService] regenerateQr: error=UPSTREAM_HTTP_500, backendError=internal_error, backendMessage=...
```

### Test 3: Corelare RequestId
```bash
# 1. Trigger regenerateQr
# 2. Verifică requestId în toate logs:
# Expected: Flutter: requestId=req_xxx
# Expected: Functions: requestId=req_xxx
# Expected: Railway: requestId=req_xxx
```

---

## Pași de Debugging

### Pasul 1: Identifică RequestId în Flutter
```dart
// Flutter logs
[WhatsAppApiService] regenerateQr: requestId=req_1234567890
```

### Pasul 2: Caută în Functions Logs
```bash
# Firebase Functions logs
grep "req_1234567890" functions.log
# Expected: [whatsappProxy/regenerateQr] Railway error body: {...}
```

### Pasul 3: Caută în Railway Logs
```bash
# Railway HTTP Logs
# Filter: /api/whatsapp/regenerate-qr/
# Search: req_1234567890
# Expected: [req_1234567890] Regenerate QR request: accountId=...
```

---

## Files Modified

1. ✅ `functions/whatsappProxy.js:915-959` - Enhanced logging pentru non-2xx responses

---

## Next Steps

1. **Deploy** fix la Firebase Functions
2. **Test** - Trigger regenerateQr care returnează 500
3. **Verifică** logs în Functions pentru detalii Railway
4. **Corelează** requestId între Flutter → Functions → Railway

---

## Root Cause Summary

**Problema:** Proxy maschează erorile Railway ca 500 generic, fără detalii.

**Fix:** 
- ✅ Loghează body-ul complet al răspunsului Railway pentru non-2xx
- ✅ Include detalii Railway în response către Flutter
- ✅ Corelare requestId end-to-end (Flutter → Functions → Railway)

**Beneficii:**
- Debugging mai ușor - vezi exact ce returnează Railway
- Flutter primește detalii pentru error handling mai bun
- Corelare requestId pentru tracing end-to-end
