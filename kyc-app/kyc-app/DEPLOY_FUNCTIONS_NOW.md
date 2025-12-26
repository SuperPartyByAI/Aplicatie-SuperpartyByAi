# 🚀 DEPLOY FUNCTIONS - Pași Exacti

## ⚠️ PROBLEMA
Chat-ul AI nu funcționează pentru că **Cloud Functions nu sunt deployed în Firebase**.

## ✅ SOLUȚIA (5 minute)

### Pas 1: Verifică că ești logat în Firebase
```bash
cd kyc-app
firebase login
```

Dacă nu ești logat, se va deschide browser-ul pentru autentificare.

### Pas 2: Verifică proiectul
```bash
firebase projects:list
```

Ar trebui să vezi: `superparty-frontend`

### Pas 3: Deploy DOAR Functions
```bash
firebase deploy --only functions
```

**Durată**: ~2-5 minute

**Output așteptat**:
```
✔  functions[chatWithAI(us-central1)] Successful create operation.
✔  functions[extractKYCData(us-central1)] Successful create operation.
✔  functions[aiManager(us-central1)] Successful create operation.
✔  functions[monitorPerformance(us-central1)] Successful create operation.

✔  Deploy complete!
```

### Pas 4: Testează Chat-ul
1. Reîmprospătează aplicația (F5)
2. Deschide chat AI (🤖)
3. Scrie: "salut"
4. Ar trebui să primești răspuns ✅

---

## 🔧 Dacă primești erori:

### Eroare: "Missing OPENAI_API_KEY"
```bash
firebase functions:secrets:set OPENAI_API_KEY
# Introdu API key-ul OpenAI când te întreabă
```

### Eroare: "Billing account required"
- Mergi la Firebase Console
- Activează Blaze Plan (pay-as-you-go)
- Primele 2M invocări/lună sunt GRATUITE

### Eroare: "Permission denied"
- Verifică că ai rol de Owner/Editor pe proiect
- Contactează owner-ul proiectului

---

## 📊 Ce funcții se vor deploya:

1. **chatWithAI** - Chat normal cu AI (GPT-4o-mini)
2. **extractKYCData** - Extragere date din documente KYC
3. **aiManager** - Manager complet (validare imagini + performanță)
4. **monitorPerformance** - Background job (rulează automat la 5 min)

---

## 🎯 După Deploy:

✅ Chat-ul AI va funcționa  
✅ Upload imagini va funcționa  
✅ Validare documente va funcționa  
✅ Performance monitoring va rula automat  

---

## 🆘 Dacă tot nu merge:

1. Verifică Console-ul browser-ului (F12) pentru erori
2. Verifică Firebase Console → Functions → Logs
3. Rulează: `firebase functions:log` pentru a vedea log-urile

---

**IMPORTANT**: Funcțiile TREBUIE deployed pentru ca aplicația să funcționeze complet!
