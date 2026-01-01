# DoD-4: INBOUND TEST REPORT

**runId:** PROD_20251229_213355_e42ebb  
**Timestamp:** 2025-12-29T21:43:17Z

## VERDICT: ✅ PASS

## SETUP

- SENDER: account_1767042206934 (phone: 40786522611)
- RECEIVER: account_1767044290665 (phone: 40737571397)

## TEST EXECUTION

1. Sent message from SENDER to RECEIVER
2. Message: INBOUND-PROBE-PROD_20251229_213355_e42ebb-1767044595
3. Inbound received in 15s

## EVIDENCE

**Firestore path:** wa_messages/3EB0BB4C4A7850B8AE138F

**Message data:**

```json
{
  "id": "3EB0BB4C4A7850B8AE138F",
  "direction": "inbound",
  "body": "INBOUND-PROBE-PROD_20251229_213355_e42ebb-1767044595",
  "accountId": "account_1767044290665",
  "clientJid": "40786522611@s.whatsapp.net",
  "waMessageId": "3EB0BB4C4A7850B8AE138F",
  "status": "delivered",
  "tsClient": "2025-12-29T21:43:16.000Z"
}
```

## LOGS

- messages.upsert event triggered
- Direction correctly identified as inbound
- Persisted to Firestore with correct fields
