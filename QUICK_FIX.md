# ⚡ QUICK FIX - Firebase CLI Missing

## 🎯 Problema
```
firebase: The term 'firebase' is not recognized...
```

## ✅ Soluția (2 minute)

### Copie-Paste în PowerShell:

```powershell
# 1. Verifică Node.js (ar trebui să fie instalat)
node --version

# 2. Instalează Firebase CLI
npm install -g firebase-tools

# 3. Verifică instalare
firebase --version

# 4. Login și Deploy
firebase login
firebase deploy --only functions
```

---

## 🔴 Dacă `node --version` dă eroare

**Node.js nu este instalat!**

### Instalează Node.js:

1. **Download:** https://nodejs.org/en/download/
2. **Instalează:** Versiunea LTS (Long Term Support)
3. **Restart PowerShell**
4. **Verifică:** `node --version`
5. **Continuă cu comenzile de mai sus**

---

## ⏱️ Timp Total

- **Cu Node.js instalat:** 2 minute
- **Fără Node.js:** 5 minute (include instalare Node.js)

---

## 📋 Checklist

- [ ] Node.js instalat (`node --version` funcționează)
- [ ] Firebase CLI instalat (`npm install -g firebase-tools`)
- [ ] Firebase CLI verificat (`firebase --version`)
- [ ] Login Firebase (`firebase login`)
- [ ] Deploy (`firebase deploy --only functions`)

---

## 🆘 Dacă Tot Nu Funcționează

**Alternativă - Folosește NPX (fără instalare globală):**

```powershell
npx firebase-tools login
npx firebase-tools deploy --only functions
```

---

**Documentație completă:** `INSTALL_FIREBASE_CLI.md`
