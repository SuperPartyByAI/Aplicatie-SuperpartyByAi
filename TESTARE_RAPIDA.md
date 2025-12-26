# 🚀 Ghid Testare Rapidă - Chat Clienți

## Acces Aplicație

**URL Frontend**: [https://5173--019b5ba6-bfb8-71ea-a9ce-1e903adbc8a2.eu-central-1-gitpod.dev](https://5173--019b5ba6-bfb8-71ea-a9ce-1e903adbc8a2.eu-central-1-gitpod.dev)

**Login**: Folosește contul tău Firebase (Google/Email)

---

## 📱 Testare Module

### 1. Modul Animator (Toți Utilizatorii)

**Acces**: Dashboard → Buton "💬 Chat Clienți"

**Ce să testezi**:
1. ✅ Click pe "💬 Chat Clienți" din Dashboard
2. ✅ Vezi lista de 3 clienți mock:
   - Ion Popescu (2 mesaje necitite)
   - Maria Ionescu
   - Andrei Georgescu (1 mesaj necitit)
3. ✅ Click pe un client
4. ✅ Vezi conversația cu mesaje mock
5. ✅ Scrie un mesaj și trimite
6. ✅ Mesajul apare instant în chat

**Rezultat așteptat**: Chat funcțional cu mock data

---

### 2. Modul Admin (Doar ursache.andrei1995@gmail.com)

**Acces**: Navigare directă la `/chat-clienti`

**Ce să testezi**:
1. ✅ Accesează `/chat-clienti` din browser
2. ✅ Vezi 3 tabs:
   - **✅ Disponibili** (2 clienți)
   - **⏳ În Rezervare** (2 clienți)
   - **❌ Pierduți** (1 client)
3. ✅ Click pe fiecare tab și vezi clienții filtrați
4. ✅ Folosește search pentru a căuta clienți
5. ✅ Selectează un client și vezi chat-ul
6. ✅ Testează butoanele de mutare:
   - Din "Disponibili" → "În Rezervare"
   - Din "În Rezervare" → "Disponibil" sau "Pierdut"
   - Din "Pierduți" → "Reactivează"
7. ✅ Verifică că clientul se mută între tabs

**Rezultat așteptat**: Organizare clienți în 3 categorii funcțională

---

### 3. Modul GM (Game Master Mode)

**Acces**: Dashboard → Toggle "GM Mode" → "GM Overview"

**Ce să testezi**:
1. ✅ Activează "GM Mode" din sidebar
2. ✅ Click pe "🎮 GM Overview"
3. ✅ Scroll jos până la "📱 Gestionare Conturi WhatsApp"
4. ✅ Vezi 3 conturi mock:
   - Support 1 (✅ Conectat)
   - Vânzări (✅ Conectat)
   - Marketing (📱 Scanează QR)
5. ✅ Click pe "➕ Adaugă Cont"
6. ✅ Completează formularul
7. ✅ Vezi că se adaugă în listă (mock)

**Rezultat așteptat**: Gestionare conturi WhatsApp funcțională

---

## 🎨 Mock Data Disponibilă

### Clienți (5 total)
- **Disponibili** (2):
  - Ion Popescu - +40721234567 (2 mesaje necitite)
  - Maria Ionescu - +40722345678
  
- **În Rezervare** (2):
  - Andrei Georgescu - +40723456789 (1 mesaj necitit)
  - Elena Dumitrescu - +40724567890
  
- **Pierduți** (1):
  - Mihai Popa - +40725678901

### Conturi WhatsApp (3 total)
- Support 1 - +40721111111 (✅ Conectat)
- Vânzări - +40722222222 (✅ Conectat)
- Marketing - (📱 Scanează QR)

---

## 🔧 Funcționalități de Testat

### Chat
- [x] Vizualizare listă clienți
- [x] Selectare client
- [x] Vizualizare mesaje
- [x] Trimitere mesaj
- [x] Mesaje apar instant
- [x] Indicator mesaje necitite

### Organizare Clienți (Admin)
- [x] 3 tabs funcționale
- [x] Filtrare clienți pe status
- [x] Search clienți
- [x] Mutare între categorii
- [x] Update UI instant

### Gestionare Conturi (GM)
- [x] Vizualizare conturi
- [x] Status conturi (conectat/deconectat/QR)
- [x] Adăugare cont (mock)
- [x] Ștergere cont (mock)

---

## 🐛 Probleme Cunoscute

### Backend Nu Este Deploiat
- **Status**: Mock data activată
- **Impact**: Toate funcțiile rulează cu date simulate
- **Soluție**: Deploy backend pe Railway pentru date reale

### Pentru a Activa Backend Real:
1. Deploy backend pe Railway
2. Setează `USE_MOCK_DATA = false` în:
   - `ChatClientiScreen.jsx`
   - `ChatClienti.jsx`
   - `WhatsAppAccountManager.jsx`
3. Rebuild și redeploy frontend

---

## 📊 Checklist Testare Completă

### Modul Animator
- [ ] Deschide modal Chat Clienți
- [ ] Vezi lista clienți
- [ ] Selectează client
- [ ] Vezi conversație
- [ ] Trimite mesaj
- [ ] Închide modal

### Modul Admin
- [ ] Accesează `/chat-clienti`
- [ ] Testează tab "Disponibili"
- [ ] Testează tab "În Rezervare"
- [ ] Testează tab "Pierduți"
- [ ] Folosește search
- [ ] Mută client între tabs
- [ ] Verifică că se actualizează

### Modul GM
- [ ] Activează GM Mode
- [ ] Accesează GM Overview
- [ ] Vezi secțiunea Conturi WhatsApp
- [ ] Vezi lista conturi
- [ ] Click "Adaugă Cont"
- [ ] Completează formular
- [ ] Vezi cont adăugat

---

## 🎯 Rezultat Final Așteptat

După testare, ar trebui să poți:
1. ✅ Vedea și gestiona clienți în 3 categorii
2. ✅ Chata cu clienți în timp real
3. ✅ Muta clienți între categorii
4. ✅ Gestiona conturi WhatsApp (mock)
5. ✅ Vedea statusul conturilor

---

## 📞 Suport

Dacă întâmpini probleme:
1. Verifică că ești logat în aplicație
2. Verifică că ai permisiuni (Admin pentru `/chat-clienti`)
3. Deschide Console (F12) pentru erori
4. Contactează: ursache.andrei1995@gmail.com

---

## 🚀 Next Steps După Testare

1. **Deploy Backend pe Railway**
   - Creează proiect nou pe railway.app
   - Conectează repository GitHub
   - Deploy automat din folder `backend/`

2. **Activează Date Reale**
   - Setează `USE_MOCK_DATA = false`
   - Rebuild frontend
   - Redeploy pe Firebase

3. **Adaugă Primul Cont WhatsApp Real**
   - GM Mode → GM Overview
   - Adaugă cont
   - Scanează QR cu WhatsApp
   - Începe să primești mesaje reale

---

**Versiune**: 1.0.0  
**Data**: 26 Decembrie 2024  
**Status**: ✅ Gata de testare cu mock data
