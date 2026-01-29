# WhatsApp Firestore Audit (account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443)

- projectId: unknown
- generatedAt: 2026-01-23T17:34:51.227Z
- repoCommit: da0a7b96
- accountId: account_prod_26ec0bfb54a6ab88cc3cd7aba6a9a443

## Collections
- accounts: true
- threads: true
- outbox: true
- inboundDedupe: true
- message_ids: true
- legacy RO present: {"conturi":false,"mesaje_whatsapp":false,"cutie_de_trimis":false,"id_uri_mesaje":false,"dedupe_de_intrare":false}

## Account document
- exists: true
- fields: accountId, name, pairingCode, qrUpdatedAt, qrCode, waJid, phoneE164, historySyncCount, lastHistorySyncResult, lastHistorySyncAt, claimedBy, lastBackfillResult, lastBackfillAt, lastDisconnectCode, lastDisconnectReason, createdAt, worker, lastDisconnectedAt, lastConnectedAt, status, claimedAt, leaseUntil, updatedAt
- hashes: {}

## Thread scheme stats
{
  "canonicalCount": 13,
  "legacyCount": 0,
  "missingAccountIdCount": 0,
  "distinctAccountIdsInSample": [
    "a002401e:45"
  ],
  "canonicalExamples": [
    {
      "docIdHash": "76c16c76:62",
      "lastMessageAt": "2026-01-23T16:08:27.000Z"
    },
    {
      "docIdHash": "5253ff57:65",
      "lastMessageAt": "2026-01-23T15:59:50.000Z"
    },
    {
      "docIdHash": "fbe63b0e:64",
      "lastMessageAt": "2026-01-23T14:27:49.000Z"
    },
    {
      "docIdHash": "64c6a2a1:66",
      "lastMessageAt": "2026-01-23T14:04:35.000Z"
    },
    {
      "docIdHash": "d9c45e44:64",
      "lastMessageAt": "2026-01-23T10:37:38.000Z"
    }
  ],
  "legacyExamples": []
}

## Duplicates (sample)
- DM duplicates: 0
- Group duplicates: 0

## Outbox health
{
  "instancePassiveCount": 0,
  "successTrueCount": 0,
  "successFalseCount": 0,
  "inconsistencyCount": 0,
  "inconsistencyExamples": [],
  "railwayResponseCount": 0,
  "backendResponseCount": 0
}
