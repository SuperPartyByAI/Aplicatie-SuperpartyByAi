# Deploy – Firebase Hosting & GitHub Actions

Deploy automat pe **Firebase Hosting** prin GitHub Actions, plus comenzi manuale și login CLI pentru medii remote.

---

## 1. Secret GitHub (obligatoriu)

Pentru deploy automat din Actions ai nevoie de:

| Secret | Descriere |
|--------|-----------|
| `FIREBASE_SERVICE_ACCOUNT_SUPERPARTY_FRONTEND` | JSON al **Firebase service account** (cheie privată) pentru proiectul `superparty-frontend`. |

### Cum obții secretul

1. [Firebase Console](https://console.firebase.google.com) → proiect **superparty-frontend** → ⚙️ Project settings → **Service accounts**.
2. **Generate new private key** → descarci un fișier JSON.
3. În GitHub: repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
4. **Name:** `FIREBASE_SERVICE_ACCOUNT_SUPERPARTY_FRONTEND`  
   **Value:** conținutul întreg al fișierului JSON (copy-paste).

---

## 2. Workflow-uri GitHub Actions

### Deploy Frontend (KYC – React)

- **Fișier:** `.github/workflows/deploy-frontend.yml`
- **Trigger:** push pe `main` când se modifică:
  - `kyc-app/**`
  - `.github/workflows/deploy-frontend.yml`
  - `kyc-app/kyc-app/firebase.json`
  - `kyc-app/kyc-app/.firebaserc`
- **Ce face:** `npm ci` → `npm run build` în `kyc-app/kyc-app` → deploy **Hosting** (Firebase action) din `kyc-app/kyc-app` → deploy **Functions** (`whatsappV4`, `chatWithAI`, `aiManager`) din root.
- **Hosting:** `kyc-app/kyc-app/dist` (build Vite).  
- **EntryPoint:** `kyc-app/kyc-app`. Folosește `FirebaseExtended/action-hosting-deploy@v0`, `projectId`: `superparty-frontend`, `channelId`: `live`.

### Deploy Flutter Web

- **Fișier:** `.github/workflows/deploy-flutter-web.yml`
- **Trigger:** push pe `main` când se modifică:
  - `superparty_flutter/**`
  - `firebase.json`
  - `.github/workflows/deploy-flutter-web.yml`
- **Ce face:** `flutter pub get` → `flutter build web --release` în `superparty_flutter` → deploy **Hosting** din root.
- **Hosting:** `superparty_flutter/build/web` (definit în `firebase.json` din root).  
- **EntryPoint:** `.` (root). Aceeași action, același `projectId` și `channelId: live`.

---

## 3. Cum testezi deploy automat

1. **KYC (React):** modifici ceva în `kyc-app/` (ex. un comentariu în `kyc-app/kyc-app/src/App.jsx`), push pe `main`.  
   → Rulează **Deploy Frontend (KYC) to Firebase**. Verifici în **Actions** că job-ul trece și că site-ul KYC e live.

2. **Flutter Web:** modifici ceva în `superparty_flutter/` (ex. un comentariu în `lib/main.dart`), push pe `main`.  
   → Rulează **Deploy Flutter Web to Firebase Hosting**. Verifici în **Actions** și că app-ul Flutter web e live.

3. **Manual trigger:** ambele workflow-uri au `workflow_dispatch`. Poți rula deploy-ul din **Actions** → alegi workflow-ul → **Run workflow**.

---

## 4. Deploy manual (CLI)

### Flutter Web

```bash
cd superparty_flutter
flutter build web --release
cd ..
firebase deploy --only hosting
```

Rulezi din **root**; `firebase.json` din root indică `superparty_flutter/build/web` pentru hosting.

### KYC (React)

```bash
cd kyc-app/kyc-app
npm ci
npm run build
firebase deploy --only hosting
```

Pentru deploy și Functions (în același proiect):

```bash
cd kyc-app/kyc-app
npm ci && npm run build
firebase deploy --only hosting

cd ../..
firebase deploy --only functions:whatsappV4,functions:chatWithAI,functions:aiManager --project superparty-frontend
```

---

## 5. Login CLI (medii remote, fără browser local)

Pentru **Firebase CLI** pe mașini remote (SSH, CI fără service account etc.) unde nu poți folosi browser local:

```bash
npx firebase login --no-localhost
```

sau, dacă ai Firebase CLI instalat global:

```bash
firebase login --no-localhost
```

CLI-ul afișează un **link**; îl deschizi pe un device cu browser, te autentifici, introduci codul în terminal. După aceea, comenzile `firebase deploy` etc. folosesc sesiunea ta.

---

## 6. Conflict între Flutter și KYC pe Hosting

Ambele workflow-uri deployează pe același proiect Firebase (**superparty-frontend**) și același **Hosting** (site-ul default, `channelId: live`).  
**Consecință:** ultimul deploy **suprascrie** ce e live. Dacă rulezi doar deploy Flutter, vei avea Flutter web live; dacă rulezi doar deploy KYC, vei avea KYC live.

- Trigger-urile sunt pe **paths** diferite (`superparty_flutter/**` vs `kyc-app/**`), deci nu rulează ambele la același push, decât dacă modifici ambele părți.
- Dacă vrei **ambele** live în paralel, trebuie **Firebase Hosting multisite**: două site-uri (ex. `superparty-app`, `kyc-app`) și două **targets** în `firebase.json` / `.firebaserc`, cu workflow-urile setate să deployeze fiecare la propriul target. Acest setup nu e făcut aici; păstrăm ambele workflow-uri **separate** și documentăm conflictul.

---

## 7. Referințe rapide

- **Firebase Console:**  
  [https://console.firebase.google.com/project/superparty-frontend](https://console.firebase.google.com/project/superparty-frontend)
- **Hosting:**  
  [https://console.firebase.google.com/project/superparty-frontend/hosting](https://console.firebase.google.com/project/superparty-frontend/hosting)
- **Actions:**  
  [https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions](https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/actions)
