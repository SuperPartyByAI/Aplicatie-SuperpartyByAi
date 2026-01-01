# PROBE_SENDER Setup Guide

## Overview

The **PROBE_SENDER** account is required for **inbound probe** testing. It sends test messages to OPERATOR accounts to verify message reception.

## Requirements

- 1 dedicated WhatsApp account (separate from OPERATOR accounts)
- Connected status (QR code scanned)
- Role: `probe_sender`

## Setup Methods

### Method 1: Environment Variable (Recommended)

Set the `PROBE_SENDER_ACCOUNT_ID` environment variable in Railway:

```bash
PROBE_SENDER_ACCOUNT_ID=account_1767042206934
```

The inbound probe job will use this account to send test messages.

### Method 2: Firestore Role Assignment

1. Navigate to Firestore console
2. Find the account document: `wa_accounts/{accountId}`
3. Add field: `role: "probe_sender"`
4. Save changes

The inbound probe job will automatically detect accounts with `role="probe_sender"`.

### Method 3: Account Naming Convention

Create an account with ID containing `probe_sender`:

```bash
curl -X POST https://whats-upp-production.up.railway.app/api/whatsapp/accounts \
  -H "Content-Type: application/json" \
  -d '{"accountId": "probe_sender_001"}'
```

The inbound probe job will detect accounts with `probe_sender` in the ID.

## Verification

After setup, verify the probe sender is detected:

```bash
node scripts/verify-probes.js
```

Expected output:

```
=== INBOUND PROBE ===

✅ Found 1 inbound probe(s)

Latest probe:
  - ID: IN_20251229T22
  - Timestamp: 2025-12-29T22:29:47.268Z
  - Result: PASS
  - Latency: 1234ms
  - Path: wa_metrics/longrun/probes/IN_20251229T22

✅ Pass rate: 100.0%
```

## Troubleshooting

### No inbound probes found

**Cause:** PROBE_SENDER account not configured or not connected

**Solution:**

1. Check account status: `curl https://whats-upp-production.up.railway.app/api/whatsapp/accounts`
2. Verify account is connected
3. Verify role is set (Method 1, 2, or 3)
4. Restart service to reload configuration

### Inbound probe FAIL

**Cause:** OPERATOR account not receiving messages

**Solution:**

1. Check OPERATOR account status
2. Verify phone numbers are correct
3. Check WhatsApp message delivery logs
4. Verify network connectivity

## Architecture

```
┌─────────────────┐
│ PROBE_SENDER    │
│ (dedicated acc) │
└────────┬────────┘
         │
         │ Send test message
         │ "PROBE_IN_{timestamp}"
         │
         ▼
┌─────────────────┐
│ OPERATOR        │
│ (main accounts) │
└─────────────────┘
         │
         │ Receive & verify
         │
         ▼
┌─────────────────┐
│ Firestore       │
│ wa_metrics/     │
│ longrun/probes/ │
└─────────────────┘
```

## Probe Schedule

- **Frequency:** Every 6 hours
- **Timeout:** 30 seconds
- **Expected latency:** < 5 seconds
- **Pass criteria:** Message received within timeout

## Firestore Schema

Inbound probe document:

```json
{
  "probeKey": "IN_20251229T22",
  "type": "inbound",
  "ts": 1767047387000,
  "tsIso": "2025-12-29T22:29:47.268Z",
  "result": "PASS",
  "latencyMs": 1234,
  "details": {
    "messageId": "3EB0...",
    "receivedMessageId": "3EB0...",
    "probeSenderId": "probe_sender_001",
    "operatorId": "account_1767042206934",
    "operatorNumber": "40722222222"
  },
  "relatedIds": ["probe_sender_001", "account_1767042206934"],
  "commitHash": "7c439325",
  "serviceVersion": "2.0.0",
  "instanceId": "bcfe891c-59b1-4364-999f-4399e47e613a"
}
```

## Security Considerations

- PROBE_SENDER should NOT be used for production messages
- Test messages should be clearly marked (prefix: `PROBE_IN_`)
- OPERATOR accounts should filter/ignore probe messages
- Probe messages should be deleted after verification

## Cost Optimization

- Inbound probes run every 6 hours (4 times/day)
- Each probe sends 1 message
- Monthly cost: ~120 messages (negligible)

## Monitoring

Inbound probe failures trigger Telegram alerts:

```
🚨 CONSECUTIVE PROBE FAILS

🔍 Type: inbound
❌ Consecutive fails: 2
📊 Threshold: 2

Recent probes:
  - 2025-12-29T22:29:47.268Z: FAIL (0ms)
  - 2025-12-29T22:23:47.268Z: FAIL (0ms)

Action: Check inbound functionality
```

## Next Steps

1. Set up PROBE_SENDER account (Method 1, 2, or 3)
2. Wait for first inbound probe (max 6 hours)
3. Verify probe results: `node scripts/verify-probes.js`
4. Monitor Telegram alerts for failures
5. Generate daily reports: `node scripts/generate-report.js`
