# Crearea thread-urilor și Backfill

Cum apar conversațiile în Inbox și când ajută Sync / Backfill.

---

## Cele 3 moduri de creare a thread-urilor

### 1. History sync (re-pair)

**Când:** Manage Accounts → deconectezi contul → conectezi din nou → scanezi QR.

La (re)pairing, backend-ul primește `messaging-history.set` și:

- Creează **thread placeholders** din `chats` (pentru toate conversațiile)
- Scrie mesajele în Firestore (`threads/{threadId}/messages`)
- Salvează contactele

**Rezultat:** Inbox arată toate conversațiile; Backfill le poate umple cu istoric ulterior.

**Config:** `WHATSAPP_SYNC_FULL_HISTORY=true` (implicit). Vezi `whatsapp-backend/server.js` (Baileys `syncFullHistory`).

---

### 2. Mesaje noi (realtime)

**Când:** Trimiți sau primești mesaje noi pe WhatsApp pentru acel cont.

Backend-ul (realtime) scrie mesajul în Firestore și **creează thread-ul dacă nu există**.

**Rezultat:** Conversații noi apar în Inbox pe măsură ce apar mesaje.

---

### 3. Sync / Backfill

**Ce face:** Completează **doar** thread-uri **deja existente** cu istoric (mesaje vechi).

**Ce nu face:** Nu creează thread-uri noi.

- Cu **0 thread-uri**, backfill nu ajută.
- După ce ai thread-uri (din 1 sau 2), poți rula **Sync / Backfill** pentru istoric.

---

## Ce să faci când nu vezi conversații

| Situație | Acțiune |
|----------|---------|
| 0 conversații, cont conectat | **Re-pair** (deconectează → conectează → scan QR) **sau** trimite/primește mesaje noi. Apoi (opțional) Sync / Backfill. |
| Conversații există, dar lipsesc mesaje vechi | **Sync / Backfill** (Inbox ⋯ sau Manage Accounts → Backfill history). |
| 0 conturi conectate | Conectează cel puțin un cont în Manage Accounts. |

---

## Doc și cod relevant

- **Pipeline ingestie:** `docs/INGESTION_PIPELINE_INBOX.md`
- **Verificare sync:** `docs/VERIFICARE_SINCRONIZARE_HETZNER.md`
- **Backend:** `whatsapp-backend/RUNBOOK_WHATSAPP_SYNC.md`, `whatsapp-backend/HISTORY_SYNC_IMPLEMENTATION_COMPLETE.md`
- **Backfill API:** `POST /api/whatsapp/backfill/:accountId`, proxy `whatsappProxyBackfillAccount`
