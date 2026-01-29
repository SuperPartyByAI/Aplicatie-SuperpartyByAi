# Firebase Functions Deploy Fixes (CPU Quota, createEventFromAI, whatsapp Stub)

**Context:** Deploy fails with "Quota exceeded for total allowable CPU per project per region", `createEventFromAI` container "failed to start and listen on PORT=8080", and `whatsapp` Gen1 delete blocks deploy.

---

## 1. CPU Quota (Gen2 Cloud Run)

### Causes

- **minInstances > 0** reserves CPU 24/7; multiple functions with minInstances 1 exceed project/region quota.
- **maxInstances** too high (e.g. 10) across many functions increases peak CPU.
- **memory** 512MiB+ on many functions adds to resource pressure.

### Changes applied

| Item | Before | After |
|------|--------|-------|
| **setGlobalOptions** | `maxInstances: 2`, no minInstances | `minInstances: 0`, `maxInstances: 3` |
| **All Gen2 functions** | minInstances implicit or 1 | `minInstances: 0` explicit |
| **whatsappProxy\*** | maxInstances 1, no memory | `memory: '256MiB'`, `maxInstances: 3` |
| **whatsappV4** | maxInstances 2 | `minInstances: 0`, `maxInstances: 3` |
| **chatWithAI, createEventFromAI, aiEventHandler, etc.** | us-central1, maxInstances 1 | **europe-west1**, `minInstances: 0`, `maxInstances: 3` |
| **processOutbox, auditEventChanges, aggregateClientStats, processFollowUps** | no minInstances | `minInstances: 0`, `maxInstances: 1–3` |

### Regioni

- **us-central1:** whatsapp stub (Gen1), whatsappV4, whatsappProxy\*, processOutbox, auditEventChanges, setStaffCode, processFollowUps.
- **europe-west1:** chatWithAI, createEventFromAI, aiEventHandler, chatEventOps, chatEventOpsV2, clientCrmAsk, whatsappExtractEventFromThread, noteazaEventeAutomat, getEventeAI, updateEventAI, manageRoleAI, archiveEventAI, manageEvidenceAI, generateReportAI, aggregateClientStats.

**Flutter:** Callable-urile AI trebuie invocate cu `region: 'europe-west1'` (e.g. `FirebaseFunctions.instanceFor(region: 'europe-west1')`).

---

## 2. createEventFromAI (Container / PORT=8080)

### Cauză

- **@sentry/profiling-node** la init poate face crash procesul în Cloud Run înainte ca runtime-ul să asculte pe PORT=8080.

### Modificări

- **sentry.js:** Profiling dezactivat în Cloud Run (`K_SERVICE` sau `FUNCTION_TARGET` setat). `nodeProfilingIntegration` se încarcă doar local. Init în `try/catch`; fallback non-fatal.
- **createEventFromAI:** `region: 'europe-west1'`, `minInstances: 0`, `maxInstances: 3`, `memory: '256MiB'`. `normalizers` / `shortCodeGenerator` rămân lazy (require în handler).

---

## 3. whatsapp Gen1 Stub (Deploy nu mai e blocat)

### Problema

- Ștergerea automată a funcției vechi `whatsapp(us-central1)` eșua; deploy-ul era blocat.

### Soluție

- **Stub Gen1** `whatsapp` (us-central1) răspunde **410 Deprecated** cu JSON `{ error: 'Deprecated', message: 'Use whatsappProxy* or whatsappV4.' }`.
- Deploy **nu mai încearcă ștergerea**; actualizează funcția existentă cu stub-ul.

### Ștergere manuală (opțional)

Dacă vrei să elimini complet `whatsapp`:

```bash
firebase functions:delete whatsapp --region us-central1 --force
```

Dacă eșuează, șterge din **GCP Console** → **Cloud Functions** → **1st gen** → `whatsapp` (us-central1) → Delete. Apoi elimină exportul `whatsapp` din `functions/index.js` și redeploy.

---

## 4. Deploy pe „buckets” (Comenzi recomandate)

### Bucket 1: Doar WhatsApp proxy (rapid, esențial)

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi

firebase deploy --only "functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr,functions:whatsappProxyGetThreads,functions:whatsappProxyDeleteAccount,functions:whatsappProxyBackfillAccount,functions:whatsappProxySend"
```

### Bucket 2: WhatsApp + processOutbox + stub

```bash
firebase deploy --only "functions:whatsapp,functions:whatsappV4,functions:whatsappProxyGetAccounts,functions:whatsappProxyAddAccount,functions:whatsappProxyRegenerateQr,functions:whatsappProxyGetThreads,functions:whatsappProxyDeleteAccount,functions:whatsappProxyBackfillAccount,functions:whatsappProxySend,functions:processOutbox"
```

### Bucket 3: AI (europe-west1)

```bash
firebase deploy --only "functions:chatWithAI,functions:createEventFromAI,functions:aiEventHandler,functions:chatEventOps,functions:chatEventOpsV2,functions:clientCrmAsk,functions:whatsappExtractEventFromThread,functions:noteazaEventeAutomat,functions:getEventeAI,functions:updateEventAI,functions:manageRoleAI,functions:archiveEventAI,functions:manageEvidenceAI,functions:generateReportAI"
```

### Bucket 4: Staff / firestore / scheduler

```bash
firebase deploy --only "functions:setStaffCode,functions:aggregateClientStats,functions:auditEventChanges,functions:processFollowUps"
```

### Deploy complet (după ce quota e ok)

```bash
firebase deploy --only functions
```

---

## 5. Fișiere modificate (rezumat)

| Fișier | Modificări |
|--------|------------|
| `functions/sentry.js` | Profiling off în Cloud Run; init try/catch |
| `functions/index.js` | setGlobalOptions minInstances/maxInstances; whatsapp stub Gen1; whatsappV4, chatWithAI, proxy opts |
| `functions/createEventFromAI.js` | region europe-west1, minInstances 0, maxInstances 3, memory 256MiB |
| `functions/processOutbox.js` | minInstances 0, maxInstances 3 |
| `functions/aiEventHandler_v3.js` | region europe-west1, minInstances 0, maxInstances 3 |
| `functions/chatEventOps.js` | region europe-west1, minInstances 0, maxInstances 3, memory 256MiB |
| `functions/chatEventOpsV2.js` | region europe-west1, minInstances 0, maxInstances 3, memory 256MiB |
| `functions/clientCrmAsk.js` | region europe-west1, minInstances 0, maxInstances 3 |
| `functions/whatsappExtractEventFromThread.js` | region europe-west1, minInstances 0, maxInstances 3 |
| `functions/staffCodeManager.js` | minInstances 0, maxInstances 3 |
| `functions/aggregateClientStats.js` | minInstances 0, maxInstances 3 |
| `functions/auditEventChanges.js` | minInstances 0, maxInstances 3 |
| `functions/followUpScheduler.js` | region, minInstances 0, maxInstances 1 |
| `functions/noteazaEventeAutomat.js` | region europe-west1, minInstances 0, maxInstances 3, memory 256MiB |
| `functions/getEventeAI.js` | idem |
| `functions/updateEventAI.js` | idem |
| `functions/manageRoleAI.js` | idem |
| `functions/manageEvidenceAI.js` | idem |
| `functions/generateReportAI.js` | idem |
| `functions/archiveEventAI.js` | idem |

---

## 6. Acceptanță

- [ ] `firebase deploy --only functions` (sau deploy pe buckets) reușește fără „Quota exceeded … CPU”.
- [ ] `createEventFromAI` este READY (nu mai dă „container failed to start” / PORT=8080).
- [ ] Deploy-ul nu mai e blocat de ștergerea `whatsapp` (stub activ).
- [ ] Proxy-urile WhatsApp rămân funcționale (testează Accounts / Inbox / Send).
