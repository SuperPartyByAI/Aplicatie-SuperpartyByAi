# WhatsApp Inbox Fix – Summary & Verification

**Date:** 2026-01-25  
**Scope:** Refacere Inbox WhatsApp – numere/nume, conversații, poze profil, compat schema, backfill, verificări.

---

## 1. Fișiere modificate / adăugate

| Fișier | Modificări |
|--------|------------|
| `superparty_flutter/lib/models/thread_model.dart` | **NOU** – Model cu `fromJson`, fallback pe `threadId`, `displayName`, `clientJid`, `lastMessageText` / `lastMessagePreview` / `lastMessageBody`, `lastMessageAt`, `profilePictureUrl` / `photoUrl` |
| `superparty_flutter/lib/screens/whatsapp/whatsapp_inbox_screen.dart` | Folosește `ThreadModel`, avatar cu `CachedNetworkImage` când există `profilePictureUrl`, subtitle „număr • lastMessageText”, „No conversations yet” + Refresh, log debug 1–2 thread-uri |
| `superparty_flutter/lib/services/whatsapp_api_service.dart` | Normalizare `getThreads`: setează `lastMessageText` din `lastMessagePreview` / `lastMessageBody` / `lastMessage` dacă lipsește |
| `superparty_flutter/lib/screens/debug/whatsapp_diagnostics_screen.dart` | Secțiune „Threads API (verify no data lost)”: apel `getThreads`, count + primul thread (JSON) |
| `superparty_flutter/lib/screens/whatsapp/README_CRM_FLOW.md` | Schema thread (chei UI), `lastMessageText` / `lastMessagePreview`, `photoUrl`, backfill |
| `superparty_flutter/test/models/thread_model_test.dart` | **NOU** – Unit test `ThreadModel.fromJson` (A: lastMessageText, B: lastMessagePreview, C: lastMessageBody + remoteJid) |

---

## 2. Comenzi de rulat local

```bash
# Din root repo
cd superparty_flutter

# Analiză
flutter analyze lib/models/thread_model.dart lib/screens/whatsapp/whatsapp_inbox_screen.dart lib/screens/debug/whatsapp_diagnostics_screen.dart lib/services/whatsapp_api_service.dart

# Teste ThreadModel
flutter test test/models/thread_model_test.dart

# Build iOS (simulator)
flutter build ios --simulator

# Build web (release)
flutter build web --release

# Rulare app (ex. iOS simulator)
flutter run
```

---

## 3. Cum verifici că „nu ai pierdut date”

1. **Diagnostics (debug):** WhatsApp → Debug / Diagnostics → Refresh. Secțiunea **„Threads API (verify no data lost)”**:
   - **Threads API Count:** număr de thread-uri returnate de `getThreads`.
   - **First thread (JSON):** primul thread (trunchiat). Verifici că există `displayName` / `clientJid` / `lastMessageText` sau `lastMessagePreview`.

2. **Inbox:**  
   - Listezi thread-urile: nume/număr + preview.  
   - Pull-to-refresh: listă consistentă, fără dispariții.

3. **Dacă threads există în API dar UI era gol:** fix-ul era la **afișare** (ThreadModel + fallback-uri). După deploy, „data exists, display bug fixed”.

4. **Backfill** (dacă lipsesc conversații vechi):  
   - Cont conectat → Backfill history (super-admin).  
   - Sau `POST /api/whatsapp/backfill/:accountId` (proxy `whatsappProxyBackfillAccount`).

---

## 4. Deploy Firebase Hosting (Flutter Web)

```bash
cd /path/to/Aplicatie-SuperpartyByAi

# Login (dacă e nevoie)
npx firebase-tools login --no-localhost

# Proiect
npx firebase-tools use superparty-frontend

# Build
cd superparty_flutter && flutter pub get && flutter build web --release && cd ..

# Deploy doar hosting
npx firebase-tools deploy --only hosting --non-interactive
```

**Output folder:** `superparty_flutter/build/web` (configurat în `firebase.json` → `hosting.public`).

---

## 5. Checklist rapid

- [ ] `flutter analyze` fără erori
- [ ] `flutter test test/models/thread_model_test.dart` – toate trec
- [ ] Inbox: nume/număr + preview + avatar (inițială sau `photoUrl` dacă există)
- [ ] „No conversations yet” + Refresh când 0 thread-uri
- [ ] Diagnostics: Threads API count + first thread JSON
- [ ] Tap pe thread → Chat se încarcă din Firestore
- [ ] Pull-to-refresh în Inbox nu strică listarea
