# 🔧 Version Fix - Incrementare la 1.2.0+16

## ⚠️ Problema

```
Codul de versiune 13 a fost folosit deja. Încearcă alt cod de versiune.
```

**Cauză:** Play Store are deja versiunea 15 (sau mai mare) publicată sau în draft.

**Soluție:** Incrementare la versiunea 16 sau mai mare.

---

## 🔍 Verifică Versiunea pe Play Store

### În Play Console:

1. **Accesează:** https://play.google.com/console
2. **Selectează SuperParty**
3. **Mergi la:** Release → Production
4. **Verifică:** Ce versiune code este ultima?

**Posibile scenarii:**
- Versiunea 13 - publicată
- Versiunea 14 - în draft sau publicată
- Versiunea 15 - în draft sau publicată

---

## ✅ Soluție: Incrementare la 16

### PASUL 1: Editează pubspec.yaml

```powershell
# Editează manual sau rulează:
(Get-Content pubspec.yaml) -replace 'version: 1.2.0\+15', 'version: 1.2.0+16' | Set-Content pubspec.yaml
```

**Sau editează manual:**
```yaml
# În pubspec.yaml
version: 1.2.0+16
```

### PASUL 2: Rebuild AAB

```powershell
# Clean
flutter clean

# Build cu versiunea 16
flutter build appbundle --release
```

**Timp estimat:** 2-3 minute

---

## 🎯 Dacă Versiunea 16 Tot Nu Funcționează

### Incrementează la 17 sau 18

**Regula:** Version code trebuie să fie **mai mare** decât ultima versiune de pe Play Store.

**Exemplu:**
- Dacă Play Store are versiunea 15 → Folosește 16
- Dacă Play Store are versiunea 16 → Folosește 17
- Dacă Play Store are versiunea 17 → Folosește 18

### Quick Fix - Incrementare la 20 (Sigur)

```powershell
# Editează la versiunea 20 (sigur mai mare)
(Get-Content pubspec.yaml) -replace 'version: 1.2.0\+\d+', 'version: 1.2.0+20' | Set-Content pubspec.yaml

# Rebuild
flutter clean
flutter build appbundle --release
```

---

## 📋 Pași Completi

### 1. Verifică Versiunea Curentă

```powershell
Get-Content pubspec.yaml | Select-String "version:"
```

### 2. Incrementează Versiunea

**Opțiunea A - La 16:**
```powershell
(Get-Content pubspec.yaml) -replace 'version: 1.2.0\+15', 'version: 1.2.0+16' | Set-Content pubspec.yaml
```

**Opțiunea B - La 20 (Sigur):**
```powershell
(Get-Content pubspec.yaml) -replace 'version: 1.2.0\+\d+', 'version: 1.2.0+20' | Set-Content pubspec.yaml
```

### 3. Verifică Schimbarea

```powershell
Get-Content pubspec.yaml | Select-String "version:"
```

**Output așteptat:** `version: 1.2.0+16` sau `version: 1.2.0+20`

### 4. Clean și Rebuild

```powershell
flutter clean
flutter build appbundle --release
```

### 5. Verifică AAB Nou

```powershell
Get-Item build\app\outputs\bundle\release\app-release.aab | Select-Object Name, Length, LastWriteTime
```

**Verifică că `LastWriteTime` este recent.**

---

## 📂 Locație AAB

**AAB-ul este întotdeauna în aceeași locație:**
```
build\app\outputs\bundle\release\app-release.aab
```

**Fiecare rebuild suprascrie AAB-ul vechi cu cel nou.**

---

## 🔍 Cum Să Verifici Versiunea în AAB

### Metoda 1: Play Console

După upload, Play Console va afișa:
- Version name: 1.2.0
- Version code: 16 (sau 20)

### Metoda 2: Build Output

Când rulezi `flutter build appbundle --release`, versiunea este embedată automat în AAB.

---

## ⚠️ Important

### Version Code Rules

1. **Trebuie să fie unic** - Nu poate fi refolosit niciodată
2. **Trebuie să fie crescător** - Mai mare decât ultima versiune
3. **Nu poate fi șters** - Odată folosit, rămâne în istoric
4. **Poate sări numere** - Poți merge de la 15 la 20 direct

### Drafts și Versiuni

**Atenție:** Dacă ai creat un draft cu versiunea 15 și nu l-ai publicat, tot trebuie să folosești 16 sau mai mare!

**Soluție:** Șterge draft-ul vechi sau folosește versiune mai mare.

---

## 🎯 Quick Fix - Copie-Paste

**Incrementare la 20 și rebuild (sigur funcționează):**

```powershell
# Incrementează la 20
(Get-Content pubspec.yaml) -replace 'version: 1.2.0\+\d+', 'version: 1.2.0+20' | Set-Content pubspec.yaml

# Verifică
Get-Content pubspec.yaml | Select-String "version:"

# Clean și rebuild
flutter clean
flutter build appbundle --release

# Verifică AAB
Get-Item build\app\outputs\bundle\release\app-release.aab | Select-Object LastWriteTime

# Deschide folder
explorer build\app\outputs\bundle\release\
```

---

## 📊 Versiuni Posibile

### Istoric
- v1.0.0+1 - Initial release
- v1.1.0+13 - Versiune pe Play Store
- v1.2.0+14 - Tentativă (respinsă)
- v1.2.0+15 - Tentativă (respinsă)
- **v1.2.0+16** - Următoarea tentativă
- **v1.2.0+20** - Sigur mai mare (recomandat)

---

## ✅ Checklist

- [ ] Verificat versiunea pe Play Store
- [ ] Incrementat versiunea în pubspec.yaml (16 sau 20)
- [ ] Verificat schimbarea
- [ ] Flutter clean executat
- [ ] AAB rebuild executat
- [ ] AAB nou verificat (LastWriteTime recent)
- [ ] Upload pe Play Store
- [ ] Verificat că versiunea este acceptată

---

## 🆘 Dacă Tot Nu Funcționează

### Verifică în Play Console

1. **Mergi la:** Release → Production
2. **Verifică:** Toate versiunile (inclusiv drafts)
3. **Notează:** Cea mai mare versiune code
4. **Folosește:** Versiune code mai mare cu +1

### Șterge Drafts Vechi

Dacă ai drafts cu versiuni 14, 15:
1. Mergi la Release → Production
2. Găsește draft-urile
3. Delete draft
4. Încearcă din nou cu versiunea 16

---

**Versiune recomandată:** 1.2.0+20  
**Status:** Ready for rebuild  
**Next:** Incrementează și rebuild
