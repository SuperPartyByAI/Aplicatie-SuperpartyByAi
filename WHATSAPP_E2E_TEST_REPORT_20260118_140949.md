# WhatsApp E2E Test Report
Generated: Sun Jan 18 14:09:49 EET 2026

## Test: 0. Old WhatsApp 1st gen function cleanup
**Status:** ⚠️  MANUAL ACTION REQUIRED
**Timestamp:** Sun Jan 18 14:09:52 EET 2026
**Details:**
```
Found old function. Delete via Firebase Console:\nFirebase Console → Project superparty-frontend → Functions → Filter '1st gen' → Find 'whatsapp' → Delete\nThen run: firebase deploy --only functions
```

## Test: 1. legacy hosting Health Check
**Status:** ✅ PASS
**Timestamp:** Sun Jan 18 14:09:53 EET 2026
**Details:**
```
{"status":"healthy","version":"2.0.0","commit":"892419e6","bootTimestamp":"2026-01-18T12:09:25.789Z","deploymentId":"9bb34f7b-cb7d-4a48-82d8-f944dd3463e1","mode":"single","uptime":27,"timestamp":"2026-01-18T12:09:53.164Z","accounts":{"total":0,"connected":0,"connecting":0,"disconnected":0,"needs_qr":0,"max":30},"firestore":{"status":"connected","policy":{"collections":["accounts - account metadata and status","wa_sessions - encrypted session files","threads - conversation threads","threads/{threadId}/messages - messages per thread","outbox - queued outbound messages","wa_outbox - WhatsApp-specific outbox"],"ownership":"Single worker owns all accounts (no lease coordination yet)","lease":"Not implemented - future: claimedBy, claimedAt, leaseUntil fields"}},"lock":{"owner":"9bb34f7b-cb7d-4a48-82d8-f944dd3463e1","expiresAt":null,"note":"Lease/lock system not yet implemented - single worker mode"},"errorsByStatus":{}}
```

## Test: 2. Firebase Functions Available
**Status:** ✅ PASS
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
│ whatsappExtractEventFromThread │ v2      │ callable                                   │ us-central1 │ 512    │ nodejs20 │
│ whatsappProxyAddAccount        │ v2      │ https                                      │ us-central1 │ 256    │ nodejs20 │
│ whatsappProxyBackfillAccount   │ v2      │ https                                      │ us-central1 │ 256    │ nodejs20 │
│ whatsappProxyDeleteAccount     │ v2      │ https                                      │ us-central1 │ 256    │ nodejs20 │
│ whatsappProxyGetAccounts       │ v2      │ https                                      │ us-central1 │ 256    │ nodejs20 │
│ whatsappProxyRegenerateQr      │ v2      │ https                                      │ us-central1 │ 256    │ nodejs20 │
│ whatsappProxySend              │ v2      │ https                                      │ us-central1 │ 256    │ nodejs20 │
│ whatsappV4                     │ v2      │ https                                      │ us-central1 │ 512    │ nodejs20 │
│ whatsapp                       │ v1      │ https                                      │ us-central1 │ 2048   │ nodejs20 │
```

## Test: 3. Firestore Rules Protection
**Status:** ✅ PASS
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Rules file exists with threads/messages protection
```

## Test: 4. legacy hosting Variables
**Status:** ⚠️  MANUAL CHECK REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Verify in legacy hosting dashboard:\n- SESSIONS_PATH=/app/sessions\n- FIREBASE_SERVICE_ACCOUNT_JSON=... (set)\n- ADMIN_TOKEN=... (if exists)\n- Single instance (no scale-out)
```

## Test: 5. Pair WhatsApp Account (QR)
**Status:** ⏳ MANUAL TEST REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Steps:\n1. Open Flutter app → WhatsApp → Accounts\n2. Add account (WA-01)\n3. Display QR code\n4. On phone: WhatsApp → Linked devices → Link a device → Scan QR\n5. Verify status becomes 'connected' in app\n\nExpected: Account shows as connected after QR scan
```

## Test: 6. Inbox/Threads Visibility
**Status:** ⏳ MANUAL TEST REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Steps:\n1. Open Flutter app → WhatsApp → Inbox\n2. Select accountId = WA-01\n3. Verify threads appear (if messages exist)\n\nExpected: Threads list visible for selected account
```

## Test: 7. Receive Message (Client → WA-01)
**Status:** ⏳ MANUAL TEST REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Steps:\n1. From client phone, send message to WA-01 number\n2. In app: Open Chat for that thread\n3. Verify message appears in app\n4. Check Firestore: threads/{threadId}/messages/{messageId} exists\n\nExpected: Message appears in app and persists in Firestore
```

## Test: 8. Send Message (WA-01 → Client)
**Status:** ⏳ MANUAL TEST REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Steps:\n1. In app Chat: Type and send message\n2. Verify client receives on WhatsApp\n3. Check Firestore: outbox entry created, message status updates (sent/delivered/read)\n\nExpected: Message sent successfully, status tracked in Firestore
```

## Test: 9. Restart Safety
**Status:** ⏳ MANUAL TEST REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Steps:\n1. Pair WA-01 and send/receive a few messages\n2. Restart/redeploy legacy hosting backend\n3. Verify:\n   - Account remains connected (no QR required)\n   - Messages remain visible in app\n   - If messages received during restart, they appear after restart\n\nExpected: Conversations persist, no data loss
```

## Test: 10. CRM Extract/Save/Ask AI
**Status:** ⏳ MANUAL TEST REQUIRED
**Timestamp:** Sun Jan 18 14:09:56 EET 2026
**Details:**
```
Steps:\n1. In Chat → CRM Panel → Extract Event\n2. Verify draft: data/ora/adresă/personaje/sumă\n3. Save Event → creates document in evenimente collection\n4. Verify aggregateClientStats updates clients/{phoneE164} (eventsCount, lifetimeSpend)\n5. In Client Profile → Ask AI: 'câți bani a cheltuit clientul cu telefonul X'\n\nExpected: Event extraction works, client stats aggregate correctly, AI returns correct totals
```


## Test Summary
**Total Tests:** 11
**Completed:** 3
**Manual Tests Pending:** 6

## Next Steps
1. If old 1st gen function exists, delete it via Firebase Console
2. Run manual tests 5-10 in Flutter app
3. Update this report with manual test results
4. After all tests pass, proceed with onboarding 30 accounts (WA-01 to WA-30)
