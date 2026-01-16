# Windows OneDrive File Locks - Fix Definitiv

## Simptome

**Eroare tipică:**
```
Execution failed for task ':cloud_firestore:compileDebugJavaWithJavac'.
> java.io.IOException: Unable to delete directory '...\build\cloud_firestore\...'
  Failed to delete some children. This might happen because a process has files open
  or has its working directory set in the target directory.
```

**Alte erori comune:**
- "The process cannot access the file because it is being used by another process"
- "Cannot delete folder: Access is denied"
- Build failures repetitive pe Windows
- Gradle/Flutter nu poate șterge foldere din `build/`

## Cauze

1. **OneDrive sync conflict** - OneDrive încearcă să sincronizeze fișierele în timp ce Gradle le șterge
2. **Procese Java/Gradle blocate** - Procese anterioare care țin fișierele deschise
3. **File locks** - Windows blochează fișierele pentru sync sau scanare antivirus
4. **Working directory** - Un proces are working directory setat în folderul țintă

## Soluții

### Soluția 1: Mută Repo-ul din OneDrive (RECOMANDAT)

**Pași:**

```powershell
# 1. Creează folder dev
New-Item -ItemType Directory -Path "C:\dev" -Force

# 2. Mută repo-ul
Move-Item -Path "C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -Destination "C:\dev\Aplicatie-SuperpartyByAi"

# 3. Deschide în Cursor
# File → Open Folder → C:\dev\Aplicatie-SuperpartyByAi
```

**Avantaje:**
- Elimină complet problemele de file locking
- Build-uri mai rapide (fără sync overhead)
- Mai puține erori de compilare

---

### Soluția 2: Pauzează OneDrive Sync (Temporar)

**Pași:**

1. Click pe iconița OneDrive în system tray
2. Settings → Sync and backup → Advanced settings
3. Pause syncing → Pause for 2 hours (sau mai mult)
4. Rulează build-ul
5. Reactivează sync după build

**Sau prin PowerShell:**
```powershell
# Pause OneDrive (dacă e instalat OneDrive sync client)
# Nu există comandă directă - folosește UI
```

---

### Soluția 3: Exclude Foldere din OneDrive Sync

**Pași:**

1. Click pe iconița OneDrive în system tray
2. Settings → Sync and backup → Advanced settings → Files On-Demand
3. Sau: Right-click pe folderul proiect → OneDrive → Free up space
4. Exclude manual folderele:
   - `superparty_flutter\build`
   - `superparty_flutter\.dart_tool`
   - `superparty_flutter\android\.gradle`
   - `superparty_flutter\windows\flutter\ephemeral\.plugin_symlinks`

**Sau exclude complet proiectul:**
- Settings → Account → Choose folders
- Deselectează `Aplicatie-SuperpartyByAi` (sau exclude doar subfolderele de build)

---

### Soluția 4: Cleanup Agresiv (Script)

**Folosește scriptul:**
```powershell
.\tools\run_android_local.ps1
```

Scriptul face automat:
- Oprește procese Java/Gradle/Dart
- Șterge agresiv folderele de build/cache
- Rulează flutter clean și pub get
- Configurează port forwarding
- Pornește app-ul

---

## Comenzi de Cleanup Manual

### 1. Oprește Procese Blocate

```powershell
# Oprește Java
taskkill /F /IM java.exe /T

# Oprește Gradle
taskkill /F /IM gradle.exe /T

# Oprește Dart
taskkill /F /IM dart.exe /T

# Așteaptă 2 secunde
Start-Sleep -Seconds 2
```

### 2. Șterge Foldere Agresiv (cmd rmdir)

```powershell
$root = git rev-parse --show-toplevel
$flutterDir = "$root\superparty_flutter"

# Build folder
cmd /c "rmdir /s /q `"$flutterDir\build`""

# Symlinks
cmd /c "rmdir /s /q `"$flutterDir\windows\flutter\ephemeral\.plugin_symlinks`""

# Gradle cache
cmd /c "rmdir /s /q `"$flutterDir\android\.gradle`""

# Dart tool
cmd /c "rmdir /s /q `"$flutterDir\.dart_tool`""
```

### 3. Flutter Clean

```powershell
cd superparty_flutter
flutter clean
flutter pub get
```

---

## Verificare

După cleanup, verifică:

```powershell
# Verifică că procesele sunt oprite
Get-Process -Name "java" -ErrorAction SilentlyContinue
Get-Process -Name "gradle" -ErrorAction SilentlyContinue

# Verifică că folderele sunt șterse
Test-Path "superparty_flutter\build"
Test-Path "superparty_flutter\.dart_tool"
```

**PASS:** Procesele nu rulează, folderele nu există

**FAIL:** Procese încă rulează sau foldere încă există → repetă cleanup sau mută repo-ul

---

## Prevenție

1. **Mută repo-ul din OneDrive** (cea mai bună soluție)
2. **Folosește scriptul** `tools\run_android_local.ps1` (face cleanup automat)
3. **Exclude folderele de build** din OneDrive sync
4. **Pauzează OneDrive** înainte de build-uri mari

---

## Troubleshooting

### Dacă cleanup-ul eșuează în continuare:

1. **Închide Cursor complet** (toate ferestrele)
2. **Oprește manual procese** în Task Manager:
   - java.exe
   - gradle.exe
   - dart.exe
3. **Mută repo-ul** din OneDrive (Soluția 1)
4. **Rulează scriptul** din nou

### Dacă build-ul încă eșuează:

1. Verifică că repo-ul nu e pe OneDrive
2. Verifică că nu există procese Java/Gradle
3. Verifică permisiuni folder (nu ar trebui să fie problema)
4. Rulează `flutter doctor` pentru verificări

---

## Quick Reference

**Script rapid:**
```powershell
.\tools\run_android_local.ps1
```

**Cleanup manual:**
```powershell
taskkill /F /IM java.exe /T
taskkill /F /IM gradle.exe /T
cmd /c "rmdir /s /q superparty_flutter\build"
flutter clean
```

**Mutare repo:**
```powershell
Move-Item -Path "C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -Destination "C:\dev\Aplicatie-SuperpartyByAi"
```
