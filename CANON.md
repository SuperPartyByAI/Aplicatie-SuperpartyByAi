# CANON — SuperPartyByAI (source of truth)

## START HERE (permalkinks – pentru orice conversație nouă)

### AI / Context

- CANON (main): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/main/CANON.md
- CANON (permanent): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/2006f12def53bf125f76e9da99dfeae685c93b04/CANON.md
- STATE (permanent): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/docs/ai/STATE.md
- DECISIONS (permanent): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/docs/ai/DECISIONS.md

### Frontend (KYC App)

- package.json (permanent): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/package.json
- Entry (main.jsx): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/kyc-app/kyc-app/src/main.jsx
- Router (App.jsx): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/kyc-app/kyc-app/src/App.jsx
- Firebase config (firebase.js): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/kyc-app/kyc-app/src/firebase.js
- Evenimente (EvenimenteScreen.jsx): https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/kyc-app/kyc-app/src/screens/EvenimenteScreen.jsx

### Backend (Voice)

- coqui/app.py: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/blob/6d911e54bdc99536c85c08617ae8ce3078c6c165/coqui/app.py

### NU pune aici

- Orice din node_modules/
- Orice secrets (.env, creds.json, baileys_auth/\*, token-uri, chei)

---

## 0) TL;DR (2–5 rânduri)

- Ce construim: aplicația SuperPartyByAI + flow-uri (în special Evenimente) în KYC App, cu integrări (Firebase/Firestore) și componente auxiliare (ex. voice).
- Flow principal ales acum: F-001 Evenimente cap-coadă (listare → detalii → acțiune → confirmare).
- Ce e blocat acum: TODO (completezi 1 propoziție, concret).
- Următorul pas concret: verificare și stabilizare F-001 (UI + persistare + permisiuni).

## 1) Product scope

- Public țintă: TODO
- Problema rezolvată: TODO
- Ce NU facem acum (out of scope): TODO

## 2) Flow-uri (cap-coadă)

### F-001 Evenimente (principal)

Status: IN WORK

1. Intrare: userul intră în aplicație și navighează către `Evenimente` (ruta `/evenimente`).
2. Autentificare/identitate: userul este autenticat (Firebase Auth); dacă nu, este redirecționat/îndrumat către login.
3. Listare evenimente: se afișează lista de evenimente (din Firestore) + state de loading/empty/error.
4. Detalii eveniment: userul deschide pagina de detalii pentru un eveniment (din listă).
5. Acțiune: userul face o acțiune (înscriere/rezervare/participare) – se validează input și se scrie în DB.
6. Confirmare + persistare: UI confirmă; după refresh datele rămân (persistate) și se reflectă în listă/detalii.

Criterii de DONE:

- Pot reproduce flow-ul complet de 3 ori la rând fără erori.
- Datele apar în DB și în UI după refresh (persistență verificată).
- Există handling pentru: loading, empty state, error state.
- Nu există secrete în repo și nu există dependențe “vendor” comise inutil.

### F-002 (alt flow)

Status: TODO

1. TODO
2. TODO

## 3) Arhitectură (pe scurt)

- Frontend: React (KYC App) – entry `src/main.jsx`, router în `src/App.jsx`.
- Backend/API: TODO (dacă există API separat / functions).
- DB: Firebase Firestore.
- Auth: Firebase Auth.
- Hosting/Deploy: TODO.
- Integrări: TODO (ex: voice/coqui).

## 4) Fișiere cheie (entry points)

- Frontend entry: `kyc-app/kyc-app/src/main.jsx`
- Routing: `kyc-app/kyc-app/src/App.jsx`
- Firebase init: `kyc-app/kyc-app/src/firebase.js`
- Evenimente: `kyc-app/kyc-app/src/screens/EvenimenteScreen.jsx`
- Voice backend: `coqui/app.py`
- Config: `package.json`

## 5) Decizii (log)

- D-001 (2026-01-04): CANON.md este source of truth; nu depindem de chat-uri.
- D-002 (2026-01-04): În orice conversație nouă pornim din secțiunea START HERE.

## 6) Taskuri (backlog)

- T-001 — Definit și stabilizat “F-001 Evenimente” cap-coadă — IN WORK
- T-002 — Rulează local cap-coadă (setup + env) — TODO
- T-003 — Curățare repo: fără node_modules, fără secrete — TODO
- T-004 — (dacă e cazul) Cloud Functions/API: structură + deploy + permisiuni — TODO
- T-005 — Hardening: error handling + logging minim — TODO

## 7) Jurnal (append-only)

### 2026-01-04

- Am făcut: am creat CANON.md ca source of truth și am adăugat permalinks în START HERE.
- Am decis: în chat nou se dă doar link la CANON.md și obiectiv + blocaj.
- Probleme: TODO
- Next: review tehnic F-001 (App.jsx + firebase.js + EvenimenteScreen.jsx) și fixuri.

## AI / Docs

- State: docs/ai/STATE.md
- Decisions: docs/ai/DECISIONS.md
- Handoff: docs/ai/HANDOFF.md
- Chatlog (logică din discuții): docs/ai/CHATLOG.md
