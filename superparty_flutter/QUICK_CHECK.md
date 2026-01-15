# Quick Check Commands

## ✅ Folosește scriptul helper (RECOMANDAT)

Scriptul `run_flutter.ps1` gestionează automat `puro.exe` pentru tine:

```powershell
# Analyze strict (0 errors, 0 warnings, 0 infos)
.\run_flutter.ps1 analyze --fatal-infos --fatal-warnings

# Rulează toate testele (78 tests)
.\run_flutter.ps1 test --no-pub
```

## Sau manual cu puro

```powershell
# Găsește puro
$puro = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Links\puro.exe", "$env:LOCALAPPDATA\Microsoft\WindowsApps\puro.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName)

# Analyze strict
& $puro flutter analyze --fatal-infos --fatal-warnings

# Teste
& $puro flutter test --no-pub
```

## ⚠️ IMPORTANT

**NU copia mesajele de eroare în terminal!** PowerShell le va interpreta ca și comenzi.

Dacă vezi erori, rulează comenzile direct, nu copia output-ul.