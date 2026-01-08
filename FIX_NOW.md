# 🚨 FIX RAPID - Actualizare Versiune

## 📍 Navighează la Folderul Corect

**Copie-paste în PowerShell:**

```powershell
cd C:\Users\ursac\Desktop\Aplicatie-SuperpartyByAi\superparty_flutter
```

---

## ✅ Actualizează Versiunea

```powershell
# Actualizează versiunea
(Get-Content pubspec.yaml) -replace 'version: 1\.1\.0\+13', 'version: 1.2.0+20' | Set-Content pubspec.yaml

# Verifică
Get-Content pubspec.yaml | Select-String "version:"
```

**Output așteptat:** `version: 1.2.0+20`

---

## 🔨 Clean și Rebuild

```powershell
# Clean Flutter
flutter clean

# Clean Gradle
cd android
.\gradlew clean
cd ..

# Build AAB
flutter build appbundle --release
```

---

## 🎯 SAU - Tot Într-o Comandă

**Copie-paste tot:**

```powershell
cd C:\Users\ursac\Desktop\Aplicatie-SuperpartyByAi\superparty_flutter ; (Get-Content pubspec.yaml) -replace 'version: 1\.1\.0\+13', 'version: 1.2.0+20' | Set-Content pubspec.yaml ; Get-Content pubspec.yaml | Select-String "version:" ; flutter clean ; cd android ; .\gradlew clean ; cd .. ; flutter build appbundle --release
```

---

## 📋 Verificare Finală

```powershell
# Verifică AAB
Get-Item build\app\outputs\bundle\release\app-release.aab | Select-Object LastWriteTime

# Deschide folder
explorer build\app\outputs\bundle\release\
```

---

**Prima comandă:**
```powershell
cd C:\Users\ursac\Desktop\Aplicatie-SuperpartyByAi\superparty_flutter
```
